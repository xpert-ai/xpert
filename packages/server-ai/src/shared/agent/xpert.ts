import { isAIMessage, ToolMessage } from '@langchain/core/messages'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import {
    agentLabel,
    channelName,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    STATE_VARIABLE_HUMAN,
    TAgentRunnableConfigurable,
    TXpertParameter,
    TXpertTeamNode,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import z from 'zod'
import { TAgentSubgraphResult } from '../../xpert-agent'
import { XpertAgentSubgraphCommand } from '../../xpert-agent/commands/subgraph.command'
import { wrapAgentExecution } from './execution'
import { createParameters } from './parameter'
import { AgentStateAnnotation, TAgentSubgraphParams } from './state'
import { IXpertSubAgent } from './types'
import { GetXpertWorkflowQuery } from '../../xpert/queries'

/**
 * @experiment class for External Expert SubAgent
 */
export class XpertCollaborator implements IXpertSubAgent {
    readonly name: string
    readonly tool: DynamicStructuredTool
    readonly nextNodes: TXpertTeamNode[]
    readonly failNode: TXpertTeamNode
    readonly stateGraph: Runnable<any, any, LangGraphRunnableConfig>

    private constructor(params: {
        // SubAgent properties
        name: string
        tool: DynamicStructuredTool
        nextNodes: TXpertTeamNode[]
        failNode: TXpertTeamNode
        graph: Runnable<any, any, LangGraphRunnableConfig>
    }) {
        this.name = params.name
        this.tool = params.tool
        this.nextNodes = params.nextNodes
        this.failNode = params.failNode
        this.stateGraph = params.graph
    }

    /**
     * Static builder to construct XpertCollaborator
     */
    static async build(params: {
        xpert: Partial<IXpert>
        config: TAgentSubgraphParams & {
            options: {
                leaderKey: string
                isDraft: boolean
                subscriber: Subscriber<MessageEvent>
            }
            thread_id: string
            rootController: AbortController
            signal: AbortSignal
            variables?: TXpertParameter[]
            partners: string[]
        }
        commandBus: CommandBus
        queryBus: QueryBus
    }): Promise<XpertCollaborator> {
        const { xpert, config, commandBus, queryBus } = params
        const { options, thread_id, rootController, signal, variables, partners } = config
        const { subscriber, leaderKey } = options

        const { agent } = await queryBus.execute<GetXpertWorkflowQuery, { agent: IXpertAgent }>(
            new GetXpertWorkflowQuery(xpert.id)
        )

        const execution: IXpertAgentExecution = {}

        if (!agent.key) {
            throw new Error(`Key of Agent ${agentLabel(agent)} is empty!`)
        }

        // Build subgraph
        const { graph, nextNodes, failNode } = await commandBus.execute<
            XpertAgentSubgraphCommand,
            TAgentSubgraphResult
        >(
            new XpertAgentSubgraphCommand(agent.key, xpert, {
                mute: config.mute,
                store: config.store,
                thread_id,
                rootController,
                signal,
                isStart: true,
                leaderKey,
                isDraft: config.options.isDraft,
                subscriber,
                execution,
                variables,
                channel: channelName(agent.key),
                partners,
                environment: config.environment
            })
        )

        // Prepare parameters
        const parameters = xpert.agentConfig?.parameters ?? (xpert.agent.options?.hidden ? [] : xpert.agent.parameters)

        const uniqueName = xpert.slug

        // Create Tool
        const agentTool = tool(
            () => {
                // The actual execution will be handled by State Graph
            },
            {
                name: uniqueName,
                description: xpert.description,
                schema: z.object({
                    ...(createParameters(parameters) ?? {}),
                    input: z.string().describe('Ask me some question or give me task to complete')
                })
            }
        )

        // Define State Graph
        const stateGraph = RunnableLambda.from(
            async (
                state: typeof AgentStateAnnotation.State,
                config: LangGraphRunnableConfig
            ): Promise<Partial<typeof AgentStateAnnotation.State>> => {
                const call = state.toolCall
                const configurable: TAgentRunnableConfigurable = config.configurable as TAgentRunnableConfigurable
                const { executionId } = configurable

                const _execution = {
                    ...execution,
                    threadId: configurable.thread_id,
                    checkpointNs: configurable.checkpoint_ns,
                    xpert: { id: xpert.id } as IXpert,
                    agentKey: agent.key,
                    inputs: call?.args,
                    parentId: executionId,
                    status: XpertAgentExecutionStatusEnum.RUNNING,
                    predecessor: configurable.agentKey,
                    // Correlation enables domain reconciliation of the child run; it does not grant access.
                    metadata: {
                        ...(configurable.xpertId ? { requesterXpertId: configurable.xpertId } : {}),
                        ...(executionCorrelation(call?.args) ? { correlation: executionCorrelation(call?.args) } : {})
                    }
                }

                return await wrapAgentExecution(
                    async () => {
                        let result = ''
                        const subState = {
                            ...state,
                            ...call.args,
                            [STATE_VARIABLE_HUMAN]: {
                                ...call.args
                            }
                        }
                        const output = await graph.invoke(subState, {
                            ...config,
                            signal,
                            configurable: {
                                ...config.configurable,
                                agentKey: agent.key,
                                executionId: _execution.id
                            },
                            metadata: {
                                agentKey: agent.key,
                                executionId: _execution.id,
                                parentExecutionId: executionId
                            }
                        })

                        const lastMessage = output.messages[output.messages.length - 1]
                        if (lastMessage && isAIMessage(lastMessage)) {
                            result = lastMessage.content as string
                        }

                        const nState: Record<string, any> = {
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
                                ...(output[channelName(agent.key)] as Record<string, any>),
                                messages: [lastMessage]
                            }
                        }

                        // Memory write
                        agent.options?.memories?.forEach((item) => {
                            if (item.inputType === 'constant') {
                                nState[item.variableSelector] = item.value
                            } else if (item.inputType === 'variable') {
                                if (item.value === 'content') {
                                    nState[item.variableSelector] = lastMessage.content
                                }
                            }
                        })

                        return {
                            state: nState,
                            output: result
                        }
                    },
                    {
                        commandBus,
                        queryBus,
                        subscriber,
                        execution: _execution
                    }
                )()
            }
        )

        return new XpertCollaborator({
            name: uniqueName,
            tool: agentTool,
            nextNodes,
            failNode,
            graph: stateGraph.withConfig({ tags: [xpert.id] }) // Add xpert.id as tag for streaming event control
        })
    }
}

/** Accept object or JSON-string inputs only when they contain a complete correlation tuple. */
function executionCorrelation(args: unknown) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
    const value = 'executionCorrelation' in args ? parseJsonRecord(args.executionCorrelation) : undefined
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const namespace = 'namespace' in value && typeof value.namespace === 'string' ? value.namespace.trim() : ''
    const operationId = 'operationId' in value && typeof value.operationId === 'string' ? value.operationId.trim() : ''
    const subjectId = 'subjectId' in value && typeof value.subjectId === 'string' ? value.subjectId.trim() : ''
    const explicitAttributes =
        'attributes' in value &&
        value.attributes &&
        typeof value.attributes === 'object' &&
        !Array.isArray(value.attributes)
            ? value.attributes
            : undefined
    const envelope = 'flowExecution' in args ? parseJsonRecord(args.flowExecution) : undefined
    const envelopeOperationId =
        envelope && 'operationId' in envelope && typeof envelope.operationId === 'string'
            ? envelope.operationId.trim()
            : ''
    const envelopeCaseId =
        envelope && 'caseId' in envelope && typeof envelope.caseId === 'string' ? envelope.caseId.trim() : ''
    const attributes =
        explicitAttributes ??
        (envelopeOperationId === operationId && envelopeCaseId === subjectId ? envelope : undefined)
    return namespace && operationId && subjectId
        ? { ...value, namespace, operationId, subjectId, ...(attributes ? { attributes } : {}) }
        : undefined
}

/** Parses a JSON object supplied by a collaborator tool boundary. */
function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
    }
    if (typeof value !== 'string' || !value.trim()) return undefined
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : undefined
    } catch {
        return undefined
    }
}
