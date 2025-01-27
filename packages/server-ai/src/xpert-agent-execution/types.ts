import { ILLMUsage, IXpertAgentExecution } from '@metad/contracts'

export function assignExecutionUsage(execution: IXpertAgentExecution) {
	return (usage: ILLMUsage) => {
		execution.responseLatency = typeof usage.latency === 'number' ? usage.latency / 1000 : 0
		execution.tokens = (execution.tokens ?? 0) + (usage.totalTokens ?? 0)
		execution.currency = usage.currency
		execution.totalPrice = usage.totalPrice
		execution.inputTokens = usage.promptTokens
		execution.inputUnitPrice = usage.promptUnitPrice
		execution.inputPriceUnit = usage.promptPriceUnit
		execution.outputTokens = usage.completionTokens
		execution.outputUnitPrice = usage.completionUnitPrice
		execution.outputPriceUnit = usage.completionPriceUnit
	}
}
