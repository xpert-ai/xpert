import { IXpertAgentExecution } from '@xpert-ai/contracts'
import type { TLLMUsage, TModelUsageType, TToolModelUsageReporter, TToolTokenUsage } from '@xpert-ai/plugin-sdk'
import { applicationMetrics } from '../metrics'

export type TExecutionUsageRecord = {
    type?: TModelUsageType
    tokens: number
    details?: TLLMUsage
}

type TExecutionUsageWriter = (executionId: string, usage: TExecutionUsageRecord) => void | Promise<void>

export type TExecutionIdResolver = () => string | undefined
type TExecutionIdSource = string | TExecutionIdResolver
type TExecutionMetricsContext = {
    provider?: string
    model?: string
}

export function createExecutionModelUsageRecorder(
    executionIdSource: TExecutionIdSource,
    persist: TExecutionUsageWriter,
    getMetricsContext?: () => TExecutionMetricsContext | undefined
) {
    const reportedToolRequests = new Set<string>()

    const persistUsage = async (usage: TExecutionUsageRecord) => {
        if (!isPositiveTokenCount(usage.tokens)) {
            return
        }
        const executionId = resolveExecutionId(executionIdSource)
        if (executionId) {
            await persist(executionId, usage)
        }
    }

    const usageCallback = async (usage: TLLMUsage) => {
        await persistUsage({
            ...(usage.type ? { type: usage.type } : {}),
            tokens: usage.totalTokens ?? 0,
            details: usage
        })
        if (usage.type !== 'estimated' && getMetricsContext) {
            const context = getMetricsContext()
            applicationMetrics.recordLlmUsage({
                provider: context?.provider,
                model: context?.model,
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                totalPrice: usage.totalPrice,
                currency: usage.currency,
                responseLatencySeconds: typeof usage.latency === 'number' ? usage.latency / 1000 : undefined
            })
        }
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
            await persistUsage({ ...(usage.type ? { type: usage.type } : {}), tokens: usage.totalTokens })
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
            execution.tokens = (execution.tokens ?? 0) + (usage.totalTokens ?? 0)
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

function resolveExecutionId(source: TExecutionIdSource) {
    return typeof source === 'function' ? source() : source
}
