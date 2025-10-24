import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNIfElse,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TWFCaseCondition,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowComparisonOperator,
	WorkflowLogicalOperator,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { isEmpty } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { get } from 'lodash'
import { AgentStateAnnotation, nextWorkflowNodes, stateToParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

export function createRouterNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		environment: IEnvironment
	}
) {
	const { environment, commandBus, queryBus } = params
	const entity = node.entity as IWFNIfElse
	const evaluateCases = (state: typeof AgentStateAnnotation.State, config) => {
		const cases = []
		const stateEnv = stateToParameters(state, environment)
		const evaluateCondition = (condition: TWFCaseCondition) => {
			const stateValue = get(stateEnv, condition.variableSelector)
			if (typeof stateValue === 'number') {
				const conditionValue = Number(condition.value)
				switch (condition.comparisonOperator) {
					case WorkflowComparisonOperator.EQUAL:
						return stateValue === conditionValue
					case WorkflowComparisonOperator.NOT_EQUAL:
						return stateValue !== conditionValue
					case WorkflowComparisonOperator.GT:
						return stateValue > conditionValue
					case WorkflowComparisonOperator.LT:
						return stateValue < conditionValue
					case WorkflowComparisonOperator.GE:
						return stateValue >= conditionValue
					case WorkflowComparisonOperator.LE:
						return stateValue <= conditionValue
					case WorkflowComparisonOperator.EMPTY:
						return stateValue == null
					case WorkflowComparisonOperator.NOT_EMPTY:
						return stateValue != null
					default:
						return false
				}
			} else if (typeof stateValue === 'string') {
				switch (condition.comparisonOperator) {
					case WorkflowComparisonOperator.EQUAL:
						return stateValue === condition.value
					case WorkflowComparisonOperator.NOT_EQUAL:
						return stateValue !== condition.value
					case WorkflowComparisonOperator.CONTAINS:
						return stateValue.includes(condition.value)
					case WorkflowComparisonOperator.NOT_CONTAINS:
						return !stateValue.includes(condition.value)
					case WorkflowComparisonOperator.STARTS_WITH:
						return stateValue.startsWith(condition.value)
					case WorkflowComparisonOperator.ENDS_WITH:
						return stateValue.endsWith(condition.value)
					case WorkflowComparisonOperator.EMPTY:
						return isEmpty(stateValue)
					case WorkflowComparisonOperator.NOT_EMPTY:
						return !isEmpty(stateValue)
					case WorkflowComparisonOperator.IS_TRUE:
						return stateValue.toLowerCase() === 'true'
					case WorkflowComparisonOperator.IS_FALSE:
						return stateValue.toLowerCase() === 'false'
					default:
						return false
				}
			} else {
				switch (condition.comparisonOperator) {
					case WorkflowComparisonOperator.EMPTY:
						return isEmpty(stateValue)
					case WorkflowComparisonOperator.NOT_EMPTY:
						return !isEmpty(stateValue)
					case WorkflowComparisonOperator.IS_TRUE:
						return !!stateValue
					case WorkflowComparisonOperator.IS_FALSE:
						return !stateValue
					default:
						return false
				}
			}
		}

		const evaluateConditions = (conditions: TWFCaseCondition[], logicalOperator: WorkflowLogicalOperator) => {
			cases[cases.length - 1].logical_operator = logicalOperator
			cases[cases.length - 1].conditions = []
			const condition = (condition: TWFCaseCondition) => {
					const result = evaluateCondition(condition)
					const stateValue = get(stateEnv, condition.variableSelector)
					cases[cases.length - 1].conditions.push({
						variable: condition.variableSelector,
						value: stateValue,
						expression: `${condition.variableSelector} ${condition.comparisonOperator} ${condition.value ?? ''}`,
						result
					})
					return result
				}
			if (logicalOperator === WorkflowLogicalOperator.AND) {
				return conditions.every(condition)
			} else {
				return conditions.some(condition)
			}
		}

		let index = 0
		for (const item of entity.cases) {
			index++
			cases.push({route: `CASE ${index}`})
			const result = evaluateConditions(item.conditions, item.logicalOperator)
			if (result) {
				// Handle the case where conditions are met
				// For example, you might want to return a specific state or perform an action
				return {
					cases,
					router: item.caseId
				}
			}
		}
		return {
			cases,
			router: 'else'
		}
	}

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, projectId, agentKey } =
					configurable

				const { router, cases } = evaluateCases(state, config)
				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.IF_ELSE,
					inputs: cases,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title,
				}
				return await wrapAgentExecution(
					async () => {
						const index = entity.cases.findIndex((c) => c.caseId === router)
						return {
							state: {
								[channelName(node.key)]: { router: `${node.key}/${router}` }
							},
							output: index > -1 ?
							  `CASE ${index + 1}` : 'ELSE',
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
			ends: []
		},
		// channel: {
		// 	name: channelName(node.key),
		// 	annotation: Annotation<Record<string, unknown>>({
		// 		reducer: (a, b) => {
		// 			return b
		// 				? {
		// 					...a,
		// 					...b
		// 				}
		// 				: a
		// 		},
		// 		default: () => ({})
		// 	})
		// },
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			const result = (<{ router: string }>state[channelName(node.key)])?.router
			return nextWorkflowNodes(graph, result, state)
		}
	}
}
