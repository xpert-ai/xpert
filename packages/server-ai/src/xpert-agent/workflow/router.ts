import { RunnableLambda } from '@langchain/core/runnables'
import {
	IEnvironment,
	IWFNIfElse,
	TWFCaseCondition,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowComparisonOperator,
	WorkflowLogicalOperator
} from '@metad/contracts'
import { isEmpty } from '@metad/server-common'
import { get } from 'lodash'
import { AgentStateAnnotation, nextWorkflowNodes, stateToParameters } from '../../shared'

export function createRouterNode(graph: TXpertGraph, node: TXpertTeamNode & { type: 'workflow' }, params: { environment: IEnvironment }) {
	const { environment } = params
	const entity = node.entity as IWFNIfElse
	const evaluateCases = (state: typeof AgentStateAnnotation.State, config) => {
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
			if (logicalOperator === WorkflowLogicalOperator.AND) {
				return conditions.every(evaluateCondition)
			} else {
				return conditions.some(evaluateCondition)
			}
		}

		for (const item of entity.cases) {
			const result = evaluateConditions(item.conditions, item.logicalOperator)
			if (result) {
				// Handle the case where conditions are met
				// For example, you might want to return a specific state or perform an action
				return node.key + '/' + item.caseId
			}
		}
		return node.key + '/else'
	}

	return {
		workflowNode: {
			graph: RunnableLambda.from(() => {
				//
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			const result = evaluateCases(state, config)
			return nextWorkflowNodes(graph, result, state)
		}
	}
}
