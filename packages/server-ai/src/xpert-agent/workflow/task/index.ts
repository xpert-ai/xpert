import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { CompiledStateGraph } from '@langchain/langgraph'
import {
	channelName,
	ChatMessageEventTypeEnum,
	getToolCallIdFromConfig,
	IEnvironment,
	IWFNTask,
	IXpertAgent,
	IXpertAgentExecution,
	STATE_VARIABLE_HUMAN,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { Subscriber } from 'rxjs'
import { z } from 'zod'
import { TAgentSubgraphParams, TGraphTool } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'

/**
 * Create task tools for agent
 * @param agentKey
 * @param graph
 */
export async function createWorkflowTaskTools(
	agentKey: string,
	graph: TXpertGraph,
	params: TAgentSubgraphParams & {
		environment: IEnvironment
		subscriber: Subscriber<any>
		isDraft: boolean
		commandBus: CommandBus
		queryBus: QueryBus
	}
) {
	const tools: TGraphTool[] = []
	const endNodes = []

	// Create task tools
	const taskNodes = graph.connections
		.filter((c) => c.from === agentKey && c.type === 'workflow')
		.map((c) =>
			graph.nodes.find(
				(n) => n.key === c.to && n.type === 'workflow' && n.entity.type === WorkflowNodeTypeEnum.TASK
			)
		)
		.filter((n) => !!n)
	await Promise.all(
		taskNodes.map(async (taskNode) => {
			const taskTool = createTaskTool(agentKey, taskNode.entity as IWFNTask, graph, params)
			tools.push(taskTool)
		})
	)

	return { tools, endNodes }
}

function createTaskTool(
	caller: string,
	taskEntity: IWFNTask,
	graph: TXpertGraph,
	params: TAgentSubgraphParams & {
		environment: IEnvironment
		subscriber: Subscriber<any>
		isDraft: boolean
		commandBus: CommandBus
		queryBus: QueryBus
	}
) {
	const subAgentNodes = graph.connections
		.filter((_) => _.type === 'agent' && _.from === taskEntity.key)
		.map(
			(_) =>
				graph.nodes.find((node) => node.key === _.to) as TXpertTeamNode & { type: 'agent'; entity: IXpertAgent }
		)
	const agentNodes = subAgentNodes.map((node) => {
		return {
			key: node.key,
			name: node.entity.name || node.key,
			description: node.entity.description,
			title: node.entity.title || node.entity.name
		}
	})
	const subAgentsDesc = agentNodes
		?.map(({ name, description }) => {
			return `- ${name}: ${description || 'No description'}`
		})
		.join('\n')

	const description = `${taskEntity.descriptionPrefix ?? ''}
${subAgentsDesc}
${taskEntity.descriptionSuffix ?? ''}`

	// Subagent graph tool
	return {
		tool: tool(
			async (_, config) => {
				const configurable = config.configurable as TAgentRunnableConfigurable
				const { xpertId, thread_id, checkpoint_ns, checkpoint_id, executionId } = configurable
				const toolCallId = getToolCallIdFromConfig(config)
				const agentNode = agentNodes.find((node) => node.name === _.subagent_type)
				if (!agentNode) {
					throw new Error(
						`invoked agent of type ${_.subagent_type}, the only allowed types are ${agentNodes.map((node) => node.name).join(', ')}`
					)
				}

				// Update event message
				await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
					id: toolCallId,
					category: 'Tool',
					message: `${agentNode.title || agentNode.key}: ` + _.description
				})

				// Instantiate sub-agent graph
				const agentKey = agentNode.key
				const abortController = new AbortController()
				const execution: IXpertAgentExecution = {
					category: 'agent',
					inputs: { input: _.description },
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey,
					title: agentNode.title
				}

				//
				const compiled = await params.commandBus.execute<
					XpertAgentSubgraphCommand,
					{ agent: IXpertAgent; graph: CompiledStateGraph<any, any, any> }
				>(
					new XpertAgentSubgraphCommand(
						agentKey,
						{ id: xpertId },
						{
							thread_id,
							isDraft: params.isDraft,
							mute: params.mute,
							store: params.store,
							isStart: true,
							rootController: abortController,
							signal: abortController.signal,
							execution: execution,
							subscriber: params.subscriber,
							disableCheckpointer: true,
							channel: channelName(agentKey),
							partners: [],
							environment: params.environment
						}
					)
				)
				const subgraph = compiled.graph

				const lastMessage = await wrapAgentExecution(
					async (execution) => {
						const state = await subgraph.invoke(
							{
								[STATE_VARIABLE_HUMAN]: {
									input: _.description
								}
							},
							config
						)

						const messages = state.messages
						const lastMessage = messages[messages.length - 1]

						return {
							state: lastMessage,
							output: lastMessage.content
						}
					},
					{
						commandBus: params.commandBus,
						queryBus: params.queryBus,
						subscriber: params.subscriber,
						execution: execution
					}
				)()

				return new ToolMessage({
					tool_call_id: toolCallId,
					content: lastMessage.content
				})
			},
			{
				name: taskEntity.key.toLowerCase(),
				description,
				schema: z.object({
					description: z.string().optional().nullable().describe('Task description'),
					subagent_type: z.string().optional().nullable().describe('Sub-agent type')
				})
			}
		),
		caller,
		toolset: {
			provider: 'workflow_task',
			title: t('server-ai:Xpert.TaskHandover'),
			id: ''
		}
	} as TGraphTool
}
