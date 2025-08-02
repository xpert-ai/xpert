import { RunnableLambda } from '@langchain/core/runnables'
import {
	IEnvironment,
	IWFNAssigner,
	IXpertAgentExecution,
	setStateVariable,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	workflowNodeIdentifier,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { AgentStateAnnotation, nextWorkflowNodes, stateToParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

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
	const { commandBus, queryBus, environment } = params
	const entity = node.entity as IWFNAssigner

	const assigners = entity.assigners

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } =
					configurable
				const stateEnv = stateToParameters(state, environment)
				const inputs = {}
				// Write to memory
				const nState = {}
				assigners.forEach((item, index) => {
					if (!item.variableSelector) {
						throw new Error(`Variable is required for item '${index}' in assigner: ${workflowNodeIdentifier(entity)}`)
					}
					if (!item.value) {
						throw new Error(`Value is required for item '${index}' in assigner: ${workflowNodeIdentifier(entity)}`)
					}
					if (item.inputType === 'constant') {
						setStateVariable(inputs, item.value, item.value)
						setStateVariable(nState, item.variableSelector, item.value)
					} else if (item.inputType === 'variable') {
						setStateVariable(inputs, item.value, get(stateEnv, item.value))
						setStateVariable(nState, item.variableSelector, get(stateEnv, item.value))
					}
				})
				const execution: IXpertAgentExecution = {
						category: 'workflow',
						type: WorkflowNodeTypeEnum.ASSIGNER,
						parentId: executionId,
						threadId: thread_id,
						checkpointNs: checkpoint_ns,
						checkpointId: checkpoint_id,
						agentKey: node.key,
						title: entity.title,
						inputs
					}

				return await wrapAgentExecution(async () => {
						return {
							state: nState,
							output: JSON.stringify(nState, null, 2)
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
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			return nextWorkflowNodes(graph, node.key, state)
		}
	}
}
