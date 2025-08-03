import { tool } from '@langchain/core/tools'
import {
	IEnvironment,
	IWFNAgentTool,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import { createParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

export function createAgentTools(
	graph: TXpertGraph,
	agentKey: string,
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
	}
) {
	const { commandBus, queryBus, environment } = params

	const node = graph.nodes.find((n) => n.type === 'agent' && n.key === agentKey)
	const connections = graph.connections.filter((c) => c.from === node.key + '/workflow')
	graph.nodes
		.filter((_) => _.type === 'workflow' && connections.some((c) => c.to === _.key))
		.forEach((workflowNode) => {
			return {
				tool: createAgentTool(workflowNode.entity as IWFNAgentTool, { commandBus, queryBus })
			}
		})
}

function createAgentTool(entity: IWFNAgentTool, params: { commandBus: CommandBus; queryBus: QueryBus }) {
	const { commandBus, queryBus } = params
	const zodSchema = z.object({
		...createParameters(entity.toolParameters)
	})

	return tool(
		async (_, config) => {
			const configurable: TAgentRunnableConfigurable = config.configurable
			const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
			const execution: IXpertAgentExecution = {
				category: 'workflow',
				type: WorkflowNodeTypeEnum.AGENT_TOOL,
				parentId: executionId,
				threadId: thread_id,
				checkpointNs: checkpoint_ns,
				checkpointId: checkpoint_id,
				agentKey: entity.key,
				title: entity.title,
				inputs: {}
			}
			return await wrapAgentExecution(
				async () => {


					return {
						state: {},
						output: ''
					}
				},
				{
					commandBus: commandBus,
					queryBus: queryBus,
					subscriber,
					execution
				}
			)()
		},
		{
			name: entity.toolName,
			description: entity.toolDescription,
			schema: zodSchema
		}
	)
}
