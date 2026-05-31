import { ILLMUsage, IXpertAgentExecution } from '@xpert-ai/contracts'
import { applicationMetrics } from '../metrics'

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
        applicationMetrics.recordLlmUsage({
            provider: execution.metadata?.provider,
            model: execution.metadata?.model,
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            totalPrice: usage.totalPrice,
            currency: usage.currency,
            responseLatencySeconds: execution.responseLatency
        })
    }
}
