// Native compatibility compiler: preserves existing state projections and graph edges.
import { RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { isAIMessage, ToolMessage } from '@langchain/core/messages'
import { isGraphInterrupt, LangGraphRunnableConfig } from '@langchain/langgraph'
import { invocationError } from './invocation-runtime'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    agentLabel,
    agentUniqueName,
    channelName,
    ChatMessageEventTypeEnum,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    STATE_VARIABLE_HUMAN,
    stringifyMessageContent,
    TAgentRunnableConfigurable,
    TXpertParameter,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Subscriber } from 'rxjs'
import z from 'zod'
import { AgentStateAnnotation, createParameters } from '../shared/agent'
import { TAgentSubgraphParams, TAgentSubgraphResult, messageEvent } from '../xpert-agent/agent'
import { XpertAgentSubgraphCommand } from '../xpert-agent/commands/subgraph.command'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../xpert-agent-execution/queries'

@Injectable()
export class NativeAgentCompiler {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    async compile(
        agent: IXpertAgent,
        config: TAgentSubgraphParams & {
            xpert: Partial<IXpert>
            options: Pick<
                XpertAgentSubgraphCommand['options'],
                'conversationId' | 'projectId' | 'workspaceRoot' | 'workspacePath'
            > & {
                leaderKey: string
                isDraft: boolean
                subscriber: Subscriber<MessageEvent>
            }
            thread_id: string
            rootController: AbortController
            signal: AbortSignal
            isTool: boolean
            /**
             * Temporary parameters (state variables)
             */
            variables?: TXpertParameter[]
            partners: string[]
        }
    ) {
        const { xpert, options, isTool, thread_id, rootController, signal, variables, partners } = config
        const { subscriber, leaderKey } = options
        const execution: IXpertAgentExecution = {}

        // Subgraph
        if (!agent.key) {
            throw invocationError('InvalidRequest')
        }
        const { graph, nextNodes, failNode } = await this.commandBus.execute<
            XpertAgentSubgraphCommand,
            TAgentSubgraphResult
        >(
            new XpertAgentSubgraphCommand(agent.key, xpert, {
                mute: config.mute,
                unmutes: config.unmutes,
                store: config.store,
                thread_id,
                rootController,
                signal,
                isStart: isTool,
                leaderKey,
                isDraft: config.options.isDraft,
                conversationId: options.conversationId,
                projectId: options.projectId,
                workspaceRoot: options.workspaceRoot,
                workspacePath: options.workspacePath,
                subscriber,
                execution,
                variables,
                channel: channelName(agent.key),
                partners,
                environment: config.environment
            })
        )

        const uniqueName = agentUniqueName(agent)
        const agentTool = new DynamicStructuredTool({
            func: async () => {
                throw invocationError('InvalidScope')
            },
            name: uniqueName,
            description: agent.description,
            schema: z.object({
                ...(createParameters(agent.parameters) ?? {}),
                input: z.string().describe('Ask me some question or give me task to complete')
            })
        })

        const stateGraph = RunnableLambda.from(
            async (
                state: typeof AgentStateAnnotation.State,
                config: LangGraphRunnableConfig
            ): Promise<Partial<typeof AgentStateAnnotation.State>> => {
                const call = state.toolCall
                const configurable: TAgentRunnableConfigurable = config.configurable as TAgentRunnableConfigurable
                const { executionId } = configurable

                // Record start time
                const timeStart = Date.now()
                const _execution = await this.commandBus.execute(
                    new XpertAgentExecutionUpsertCommand({
                        ...execution,
                        ...(typeof config.configurable?.agentInvocationId === 'string'
                            ? { id: config.configurable.agentInvocationId }
                            : {}),
                        threadId: configurable.thread_id,
                        checkpointNs: configurable.checkpoint_ns,
                        xpert: { id: xpert.id } as IXpert,
                        agentKey: agent.key,
                        inputs: call?.args,
                        parentId: executionId,
                        metadata: { ...execution.metadata, invocationKind: 'sub_agent' },
                        status: XpertAgentExecutionStatusEnum.RUNNING,
                        predecessor: configurable.agentKey
                    })
                )
                // Start agent execution event
                subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, _execution))

                let status = XpertAgentExecutionStatusEnum.SUCCESS
                let error = null
                let result = ''
                const finalize = async () => {
                    const _state = await graph.getState(config)

                    const timeEnd = Date.now()
                    // Record End time
                    const newExecution = await this.commandBus.execute(
                        new XpertAgentExecutionUpsertCommand({
                            id: _execution.id,
                            checkpointId: _state.config.configurable.checkpoint_id,
                            elapsedTime: timeEnd - timeStart,
                            status,
                            error,
                            outputs: {
                                output: result
                            }
                        })
                    )

                    const fullExecution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(newExecution.id))

                    // End agent execution event
                    subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, fullExecution))
                }

                try {
                    const subState = {
                        ...state,
                        ...(isTool
                            ? {
                                  ...call.args,
                                  [STATE_VARIABLE_HUMAN]: {
                                      input: call.args.input
                                  }
                                  // [`${agent.key}.messages`]: [new HumanMessage(call.args.input)]
                              }
                            : {})
                    }
                    const output = await graph.invoke(subState, {
                        ...config,
                        signal,
                        configurable: {
                            ...config.configurable,
                            agentKey: agent.key,
                            xpertName: agentLabel(agent),
                            executionId: _execution.id
                        },
                        metadata: {
                            agentKey: agent.key,
                            xpertName: agentLabel(agent),
                            executionId: _execution.id,
                            parentExecutionId: executionId
                        }
                    })

                    const lastMessage = output.messages[output.messages.length - 1]

                    if (lastMessage && isAIMessage(lastMessage)) {
                        result = lastMessage.content as string
                    }

                    const channel = output[channelName(agent.key)]
                    const projectedChannel =
                        channel && typeof channel === 'object' && !Array.isArray(channel) ? channel : {}
                    const nState: Partial<typeof AgentStateAnnotation.State> = isTool
                        ? {
                              messages: [
                                  new ToolMessage({
                                      content: lastMessage.content,
                                      name: call.name,
                                      tool_call_id: call.id ?? ''
                                  })
                              ],
                              [channelName(leaderKey)]: {
                                  messages: [
                                      new ToolMessage({
                                          content: lastMessage.content,
                                          name: call.name,
                                          tool_call_id: call.id ?? ''
                                      })
                                  ]
                              },
                              [channelName(agent.key)]: {
                                  ...projectedChannel,
                                  messages: [lastMessage]
                              }
                          }
                        : {
                              messages: [lastMessage],
                              [channelName(agent.key)]: {
                                  ...projectedChannel,
                                  messages: output.messages, // Return full messages to parent graph
                                  output: stringifyMessageContent(lastMessage.content)
                              }
                          }
                    // Write to memory
                    agent.options?.memories?.forEach((item) => {
                        if (item.inputType === 'constant') {
                            nState[item.variableSelector] = item.value
                        } else if (item.inputType === 'variable') {
                            if (item.value === 'content') {
                                Object.assign(nState, { [item.variableSelector]: lastMessage.content })
                            }
                            // @todo more variables
                        }
                    })

                    return nState
                } catch (err) {
                    error = isGraphInterrupt(err) ? null : getErrorMessage(err)
                    status = isGraphInterrupt(err)
                        ? XpertAgentExecutionStatusEnum.INTERRUPTED
                        : XpertAgentExecutionStatusEnum.ERROR

                    throw err
                } finally {
                    // End agent execution event
                    await finalize()
                }
            }
        )

        return {
            name: uniqueName,
            tool: agentTool,
            nextNodes,
            failNode,
            stateGraph: stateGraph.withConfig({ tags: [xpert.id] })
        }
    }
}
