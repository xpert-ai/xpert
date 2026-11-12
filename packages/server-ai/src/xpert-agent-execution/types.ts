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

type ExecutionUsageTotals = Pick<
    IXpertAgentExecution,
    'tokens' | 'inputTokens' | 'outputTokens' | 'totalPrice' | 'currency' | 'usageSummary'
>

/** Compute one actual call's update for both in-memory executions and locked database rows. */
export function accumulateActualExecutionUsage(current: ExecutionUsageTotals, usage: TLLMUsage, tokens: number) {
    // A pre-migration row has at most one recorded amount/currency pair.
    const costs =
        current.usageSummary?.costs.slice() ??
        (current.currency && current.totalPrice != null
            ? [{ currency: current.currency, amount: current.totalPrice, tokens: current.tokens ?? 0 }]
            : [])
    const currency = usage.currency?.trim()
    if (usage.pricingStatus !== 'unpriced' && currency && Number.isFinite(usage.totalPrice) && usage.totalPrice >= 0) {
        const index = costs.findIndex((cost) => cost.currency === currency)
        const previous = costs[index]
        const cost = {
            currency,
            amount: Number(((previous?.amount ?? 0) + usage.totalPrice).toFixed(7)),
            tokens: (previous?.tokens ?? 0) + tokens
        }
        if (previous) costs[index] = cost
        else costs.push(cost)
    }
    const single = costs.length === 1 ? costs[0] : null
    return {
        tokens: (current.tokens ?? 0) + tokens,
        inputTokens: (current.inputTokens ?? 0) + (usage.promptTokens ?? 0),
        outputTokens: (current.outputTokens ?? 0) + (usage.completionTokens ?? 0),
        usageSummary: {
            costs,
            lastInputTokens:
                usage.promptTokens > 0
                    ? usage.promptTokens
                    : (current.usageSummary?.lastInputTokens ?? current.inputTokens ?? 0)
        },
        totalPrice: single?.amount ?? null,
        currency: single?.currency ?? null,
        responseLatency: typeof usage.latency === 'number' ? usage.latency / 1000 : 0,
        inputUnitPrice: usage.promptUnitPrice,
        inputPriceUnit: usage.promptPriceUnit,
        outputUnitPrice: usage.completionUnitPrice,
        outputPriceUnit: usage.completionPriceUnit
    }
}

/**
 * Returns the usage callback for an execution that the caller will save. Invoke it once
 * per model request, with that request's usage delta. Estimates advance the total token
 * count only. Actual calls also accumulate input/output tokens and costs by currency,
 * and retain the latest measured prompt size, latency and unit prices. Metrics receive this
 * call's values, so later callbacks do not count earlier calls again.
 */
export function assignExecutionUsage(execution: IXpertAgentExecution) {
    return (usage: TLLMUsage) => {
        const tokens = usage.totalTokens ?? 0
        if (usage.type === 'estimated') {
            execution.tokens = (execution.tokens ?? 0) + tokens
            return
        }
        Object.assign(execution, accumulateActualExecutionUsage(execution, usage, tokens))
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
