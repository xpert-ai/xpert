import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNTrigger,
	IWorkflowNode,
	STATE_VARIABLE_HUMAN,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Annotation } from '@langchain/langgraph'
import { AgentStateAnnotation, nextWorkflowNodes, stateToParameters } from '../../../shared'

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
	const { commandBus, queryBus, xpertId, environment, conversationId } = params
	const entity = node.entity as IWFNTrigger

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, projectId, agentKey } =
					configurable
				const stateEnv = stateToParameters(state, environment)

				const values =
					entity.parameters?.reduce((acc, param) => {
						if (param.name) {
							acc[param.name] = stateEnv[STATE_VARIABLE_HUMAN]?.[param.name] ?? ''
						}
						return acc
					}, {}) ?? {}

				return {
					[channelName(node.key)]: values
				}
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			return nextWorkflowNodes(graph, node.key, state)
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
	}
}

export function triggerOutputVariables(entity: IWorkflowNode) {
	return ((<IWFNTrigger>entity).parameters ?? []).filter((_) => _.name)
}
