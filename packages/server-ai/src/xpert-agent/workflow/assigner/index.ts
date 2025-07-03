import { RunnableLambda } from '@langchain/core/runnables'
import {
	IEnvironment,
	IWFNAssigner,
	setStateVariable,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { AgentStateAnnotation, nextWorkflowNodes, stateToParameters } from '../../../shared'

export function createAssignerNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
	}
) {
	const { commandBus, queryBus, xpertId, environment } = params
	const entity = node.entity as IWFNAssigner

	const assigners = entity.assigners

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, projectId, agentKey } =
					configurable

				const stateEnv = stateToParameters(state, environment)

				// Write to memory
				const nState = {}
				assigners.forEach((item) => {
					if (item.inputType === 'constant') {
						setStateVariable(nState, item.variableSelector, item.value)
					} else if (item.inputType === 'variable') {
						setStateVariable(nState, item.variableSelector, get(stateEnv, item.value))
					}
				})

				return nState
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			return nextWorkflowNodes(graph, node.key, state)
		}
	}
}
