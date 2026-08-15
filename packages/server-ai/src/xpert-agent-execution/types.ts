import { IXpertAgentExecution } from '@xpert-ai/contracts'
import type { TLLMUsage, TModelUsageType, TToolModelUsageReporter, TToolTokenUsage } from '@xpert-ai/plugin-sdk'
import { applicationMetrics } from '../metrics'

type TExecutionTokenWriter = (
    executionId: string,
    usage: { type?: TModelUsageType; tokens: number }
) => void | Promise<void>

export function createExecutionModelUsageRecorder(execution: IXpertAgentExecution, persist: TExecutionTokenWriter) {
    const reportedToolRequests = new Set<string>()

    const recordTokens = async (type: TModelUsageType | undefined, tokens: number) => {
        if (!isPositiveTokenCount(tokens)) {
            return
        }
        if (execution.id) {
            await persist(execution.id, { ...(type ? { type } : {}), tokens })
        }
        addExecutionTokens(execution, tokens)
    }

    const usageCallback = async (usage: TLLMUsage) => {
        await recordTokens(usage.type, usage.totalTokens ?? 0)
    }

    const reportUsage: TToolModelUsageReporter = async (usage) => {
        if (!isToolTokenUsage(usage)) {
            return
        }
        const key = `${usage.provider}:${usage.requestId}`
        if (reportedToolRequests.has(key)) {
            return
        }
        reportedToolRequests.add(key)

        try {
            await recordTokens(usage.type, usage.totalTokens)
            if (usage.type !== 'estimated') {
                applicationMetrics.recordLlmUsage({
                    provider: usage.provider,
                    model: usage.model,
                    inputTokens: usage.promptTokens,
                    outputTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens
                })
            }
        } catch (error) {
            reportedToolRequests.delete(key)
            throw error
        }
    }

    return { usageCallback, reportUsage }
}

function addExecutionTokens(execution: IXpertAgentExecution, tokens: number) {
    execution.tokens = (execution.tokens ?? 0) + tokens
}

function isToolTokenUsage(usage: Parameters<TToolModelUsageReporter>[0]): usage is TToolTokenUsage {
    return (
        'provider' in usage &&
        (usage.type === undefined || usage.type === 'estimated') &&
        typeof usage.requestId === 'string' &&
        usage.requestId.trim().length > 0 &&
        typeof usage.provider === 'string' &&
        usage.provider.trim().length > 0 &&
        isTokenCount(usage.promptTokens) &&
        isTokenCount(usage.completionTokens) &&
        isPositiveTokenCount(usage.totalTokens) &&
        usage.totalTokens >= usage.promptTokens + usage.completionTokens
    )
}

function isPositiveTokenCount(value: number) {
    return isTokenCount(value) && value > 0
}

function isTokenCount(value: number) {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function assignExecutionUsage(execution: IXpertAgentExecution) {
    return (usage: TLLMUsage) => {
        if (usage.type === 'estimated') {
            addExecutionTokens(execution, usage.totalTokens ?? 0)
            return
        }
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
