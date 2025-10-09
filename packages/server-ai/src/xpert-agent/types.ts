import { TWFCaseCondition, WorkflowComparisonOperator } from '@metad/contracts'
import { isEmpty } from '@metad/server-common'
import { get } from 'lodash'

export const evaluateCondition = (condition: TWFCaseCondition, stateEnv) => {
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
			case WorkflowComparisonOperator.LIKE:
				return new RegExp(condition.value).test(stateValue)
			case WorkflowComparisonOperator.NOT_LIKE:
				return !new RegExp(condition.value).test(stateValue)
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
