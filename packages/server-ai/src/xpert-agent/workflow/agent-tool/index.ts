import { ToolMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { Annotation } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNAgentTool,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TToolCall,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import { AgentStateAnnotation, createParameters, nextWorkflowNodes, TWorkflowGraphNode } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

export const WORKFLOW_AGENT_TOOL_ARGS_CHANNEL = 'args'
export type TWorkflowAgentToolState = {
	[WORKFLOW_AGENT_TOOL_ARGS_CHANNEL]: Record<string, any>
	toolCall: TToolCall
}

export function createAgentToolNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		leaderKey: string
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
		conversationId: string
	}
) {
	const { commandBus, queryBus, leaderKey, xpertId, environment, conversationId } = params
	const entity = node.entity as IWFNAgentTool

	const toolName = entity.toolName || entity.key
	const zodSchema = z.object({
		...createParameters(entity.toolParameters)
	})

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, projectId, agentKey } =
					configurable

				const toolCall = state.toolCall
				const args = toolCall?.args

				if (!toolCall) {
					const messages = state.messages
					const lastMessage = messages[messages.length - 1]
					const toolCall = (<TWorkflowAgentToolState>state[channelName(node.key)]).toolCall
					return {
						[channelName(leaderKey)]: {
							messages: [
								new ToolMessage({
									tool_call_id: toolCall?.id,
									content: lastMessage.content
								})
							]
						},
						messages: [
							new ToolMessage({
								tool_call_id: toolCall?.id,
								content: lastMessage.content
							})
						],
						[channelName(node.key)]: {
							toolCall: null,
						}
					}
				}

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.AGENT_TOOL,
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
						commandBus: commandBus,
						queryBus: queryBus,
						subscriber: subscriber,
						execution
					}
				)()
			}),
			ends: []
		},
		channel: {
			name: channelName(node.key),
			annotation: Annotation<Record<string, unknown>>({
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
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			const toolCall = (<TWorkflowAgentToolState>state[channelName(node.key)])?.toolCall
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
	} as TWorkflowGraphNode
}

export function agentToolOutputVariables(entity: IWorkflowNode) {
	return [
		{
			type: XpertParameterTypeEnum.OBJECT,
			name: WORKFLOW_AGENT_TOOL_ARGS_CHANNEL,
			title: 'Arguments',
			description: {
				en_US: 'Input Arguments',
				zh_Hans: '输入参数'
			}
		}
	]
}
