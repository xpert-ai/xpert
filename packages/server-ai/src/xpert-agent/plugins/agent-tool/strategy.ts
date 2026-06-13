import { BaseMessage, ToolMessage } from '@langchain/core/messages'
import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { Annotation } from '@langchain/langgraph'
import {
    channelName,
    IEnvironment,
    IWFNAgentWorkflow,
    IWorkflowNode,
    IXpertAgentExecution,
    TAgentRunnableConfigurable,
    TToolCall,
    TWorkflowNodeMeta,
    TXpertGraph,
    TXpertParameter,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, TWorkflowNodeResult, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { z } from 'zod'
import { AgentStateAnnotation, createParameters, nextWorkflowNodes, stateToParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

export const WORKFLOW_AGENT_TOOL_ARGS_CHANNEL = 'args'
export type TWorkflowAgentToolArgs = {
    [key: string]: unknown
}
export type TWorkflowAgentToolState = {
    [WORKFLOW_AGENT_TOOL_ARGS_CHANNEL]: TWorkflowAgentToolArgs
    toolCall: TToolCall | null
}

function isToolCall(value: unknown): value is TToolCall {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    if (!('name' in value) || typeof value.name !== 'string') {
        return false
    }
    if ('id' in value && value.id !== undefined && typeof value.id !== 'string') {
        return false
    }
    if (!('args' in value) || typeof value.args !== 'object' || value.args === null || Array.isArray(value.args)) {
        return false
    }
    return true
}

function getStoredToolCall(value: unknown) {
    if (typeof value !== 'object' || value === null || !('toolCall' in value)) {
        return null
    }
    return isToolCall(value.toolCall) ? value.toolCall : null
}

function valueToToolContent(value: unknown) {
    if (value == null) {
        return ''
    }
    if (typeof value === 'string') {
        return value
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value)
    }
    try {
        return JSON.stringify(value, null, 2) ?? String(value)
    } catch {
        return String(value)
    }
}

async function resolveAgentToolReturnContent(
    entity: IWFNAgentWorkflow,
    state: typeof AgentStateAnnotation.State,
    environment?: IEnvironment
): Promise<BaseMessage['content']> {
    const returnSource = entity.returnSource
    if (!returnSource || returnSource.type === 'last_message') {
        return state.messages[state.messages.length - 1]?.content ?? ''
    }

    if (returnSource.type === 'variable') {
        if (!returnSource.variableSelector) {
            throw new Error(`Agent workflow return variable is required: ${entity.key}`)
        }
        const stateEnv = stateToParameters(state, environment)
        return valueToToolContent(get(stateEnv, returnSource.variableSelector))
    }

    if (!returnSource.template) {
        throw new Error(`Agent workflow return template is required: ${entity.key}`)
    }
    return await PromptTemplate.fromTemplate(returnSource.template, {
        templateFormat: 'mustache'
    }).format(stateToParameters(state, environment))
}

export function createWorkflowAgentWorkflowNode(
    graph: TXpertGraph,
    node: TXpertTeamNode & { type: 'workflow' },
    params: {
        leaderKey: string
        commandBus: CommandBus
        queryBus: QueryBus
        environment?: IEnvironment
    }
): TWorkflowNodeResult {
    const { commandBus, queryBus, leaderKey, environment } = params
    const entity = node.entity as IWFNAgentWorkflow

    if (!leaderKey) {
        throw new Error(`Leader key is required for agent workflow node: ${entity.key}`)
    }

    const toolName = entity.toolName || entity.key
    const zodSchema = z.object({
        ...createParameters(entity.toolParameters)
    })

    return {
        name: toolName,
        graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
            const configurable: TAgentRunnableConfigurable = config.configurable
            const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable

            const toolCall = state.toolCall
            const args = toolCall?.args

            if (!toolCall) {
                const storedToolCall = getStoredToolCall(state[channelName(node.key)])
                const content = await resolveAgentToolReturnContent(entity, state, environment)
                return {
                    [channelName(leaderKey)]: {
                        messages: [
                            new ToolMessage({
                                tool_call_id: storedToolCall?.id,
                                content
                            })
                        ]
                    },
                    messages: [
                        new ToolMessage({
                            tool_call_id: storedToolCall?.id,
                            content
                        })
                    ],
                    [channelName(node.key)]: {
                        toolCall: null
                    }
                }
            }

            const execution: IXpertAgentExecution = {
                category: 'workflow',
                type: entity.type,
                inputs: args,
                parentId: executionId,
                threadId: thread_id,
                checkpointNs: checkpoint_ns,
                checkpointId: checkpoint_id,
                agentKey: node.key,
                title: entity.title
            }
            return await wrapAgentExecution(
                async () => {
                    return {
                        state: {
                            [channelName(node.key)]: {
                                toolCall,
                                [WORKFLOW_AGENT_TOOL_ARGS_CHANNEL]: args
                            }
                        }
                    }
                },
                {
                    commandBus,
                    queryBus,
                    subscriber,
                    execution
                }
            )()
        }),
        ends: [],
        channel: {
            name: channelName(node.key),
            annotation: Annotation<Partial<TWorkflowAgentToolState>>({
                reducer: (a, b) => {
                    return b
                        ? {
                              ...a,
                              ...b
                          }
                        : a
                },
                default: () => ({})
            })
        },
        navigator: async (state: typeof AgentStateAnnotation.State) => {
            const toolCall = getStoredToolCall(state[channelName(node.key)])
            if (!toolCall) {
                return leaderKey
            }
            return nextWorkflowNodes(graph, node.key, state)
        },
        caller: leaderKey,
        toolset: {
            provider: 'workflow_agent_tool',
            title: entity.title
        },
        tool: tool(
            () => {
                //
            },
            {
                name: toolName,
                description: entity.toolDescription,
                schema: zodSchema
            }
        )
    }
}

export function createWorkflowAgentToolNode(
    graph: TXpertGraph,
    node: TXpertTeamNode & { type: 'workflow' },
    params: {
        leaderKey: string
        commandBus: CommandBus
        queryBus: QueryBus
        environment?: IEnvironment
    }
): TWorkflowNodeResult {
    return createWorkflowAgentWorkflowNode(graph, node, params)
}

export function agentToolOutputVariables(entity: IWorkflowNode): TXpertParameter[] {
    const agentTool = entity as IWFNAgentWorkflow
    return [
        ...(agentTool.toolParameters ?? []).map((param) => ({
            ...param,
            name: WORKFLOW_AGENT_TOOL_ARGS_CHANNEL + '.' + param.name
        }))
    ]
}

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.AGENT_WORKFLOW)
export class WorkflowAgentWorkflowNodeStrategy implements IWorkflowNodeStrategy {
    readonly meta: TWorkflowNodeMeta = {
        name: WorkflowNodeTypeEnum.AGENT_WORKFLOW,
        label: {
            en_US: 'Agent Workflow',
            zh_Hans: '智能体工作流'
        },
        icon: null,
        configSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    create(payload: {
        graph: TXpertGraph
        node: TXpertTeamNode & { type: 'workflow' }
        xpertId: string
        environment: IEnvironment
        isDraft: boolean
        leaderKey?: string
        conversationId?: string
    }) {
        const leaderKey = payload.leaderKey
        if (!leaderKey) {
            throw new Error(`Leader key is required for agent workflow node: ${payload.node.entity.key}`)
        }

        return createWorkflowAgentWorkflowNode(payload.graph, payload.node, {
            leaderKey,
            commandBus: this.commandBus,
            queryBus: this.queryBus,
            environment: payload.environment
        })
    }

    outputVariables(entity: IWorkflowNode): TXpertParameter[] {
        return agentToolOutputVariables(entity)
    }
}

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.AGENT_TOOL)
export class WorkflowAgentToolNodeStrategy extends WorkflowAgentWorkflowNodeStrategy {
    readonly meta: TWorkflowNodeMeta = {
        name: WorkflowNodeTypeEnum.AGENT_TOOL,
        label: {
            en_US: 'Agent Tool',
            zh_Hans: '智能体工具'
        },
        icon: null,
        deprecated: true,
        configSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    constructor(commandBus: CommandBus, queryBus: QueryBus) {
        super(commandBus, queryBus)
    }
}
