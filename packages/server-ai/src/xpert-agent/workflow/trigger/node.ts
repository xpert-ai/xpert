import { RunnableLambda } from '@langchain/core/runnables'
import { channelName, IEnvironment, IWFNTrigger, IWorkflowNode, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AgentStateAnnotation } from '../../../shared'

export function createTriggerNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
		conversationId: string
	}
) {
	const entity = node.entity as IWFNTrigger

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const triggerValues = state[channelName(node.key)] as Record<string, any>
				const values =
					entity.parameters?.reduce((acc, param) => {
						if (param.name) {
							acc[param.name] = triggerValues?.[param.name] ?? null
						}
						return acc
					}, {}) ?? {}

				return {
					[channelName(node.key)]: values
				}
			}),
			ends: []
		}
	}
}

export function triggerOutputVariables(entity: IWorkflowNode) {
	return ((<IWFNTrigger>entity).parameters ?? []).filter((_) => _.name)
}
