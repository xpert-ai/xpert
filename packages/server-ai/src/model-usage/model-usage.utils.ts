import type { IModelUsageDetails, ModelUsageMetric, ModelUsageSummary } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function normalizeModelUsageMetrics(metrics: ModelUsageMetric[]): ModelUsageMetric[] {
    if (!metrics.length) {
        throw new Error(
            t('server-ai:Error.ModelUsageMetricRequired', {
                defaultValue: 'Model usage requires at least one metric.'
            })
        )
    }

    const units = new Set<ModelUsageMetric['unit']>()
    for (const metric of metrics) {
        if (units.has(metric.unit)) {
            throw new Error(
                t('server-ai:Error.ModelUsageDuplicateMetricUnit', {
                    unit: metric.unit,
                    defaultValue: `Duplicate model usage metric unit '${metric.unit}'.`
                })
            )
        }
        units.add(metric.unit)

        if (metric.unit === 'token') {
            const values = [metric.promptTokens, metric.completionTokens, metric.totalTokens].filter(
                (value): value is number => value !== undefined
            )
            if (!values.length || values.some((value) => !isTokenCount(value))) {
                throw new Error(
                    t('server-ai:Error.ModelUsageTokenCountInvalid', {
                        defaultValue: 'Token usage requires finite non-negative integer counts.'
                    })
                )
            }
            if (
                metric.totalTokens !== undefined &&
                metric.totalTokens < (metric.promptTokens ?? 0) + (metric.completionTokens ?? 0)
            ) {
                throw new Error(
                    t('server-ai:Error.ModelUsageTokenTotalInvalid', {
                        defaultValue: 'Total tokens cannot be less than prompt plus completion tokens.'
                    })
                )
            }
            continue
        }

        if (!Number.isFinite(metric.quantity) || metric.quantity <= 0) {
            throw new Error(
                t('server-ai:Error.ModelUsageQuantityInvalid', {
                    unit: metric.unit,
                    defaultValue: `Model usage quantity for '${metric.unit}' must be positive.`
                })
            )
        }
        if (metric.unit === 'generation' && !Number.isInteger(metric.quantity)) {
            throw new Error(
                t('server-ai:Error.ModelUsageGenerationQuantityInvalid', {
                    defaultValue: 'Generation quantity must be a positive integer.'
                })
            )
        }
    }
    return metrics
}

export function emptyModelUsageSummary(): ModelUsageSummary {
    return {
        videoPromptTokens: 0,
        videoCompletionTokens: 0,
        videoTokens: 0,
        videoGenerations: 0,
        generatedSeconds: 0
    }
}

export function addModelUsageSummaries(left: ModelUsageSummary, right: ModelUsageSummary): ModelUsageSummary {
    return {
        videoPromptTokens: left.videoPromptTokens + right.videoPromptTokens,
        videoCompletionTokens: left.videoCompletionTokens + right.videoCompletionTokens,
        videoTokens: left.videoTokens + right.videoTokens,
        videoGenerations: left.videoGenerations + right.videoGenerations,
        generatedSeconds: left.generatedSeconds + right.generatedSeconds
    }
}

export function summarizeModelUsages(usages: IModelUsageDetails[]): ModelUsageSummary {
    const summary = emptyModelUsageSummary()
    for (const usage of usages) {
        if (usage.modality !== 'video') continue
        for (const metric of usage.metrics) {
            if (metric.unit === 'token') {
                summary.videoPromptTokens += metric.promptTokens ?? 0
                summary.videoCompletionTokens += metric.completionTokens ?? 0
                summary.videoTokens += metric.totalTokens ?? 0
            } else if (metric.unit === 'generation') {
                summary.videoGenerations += metric.quantity
            } else {
                summary.generatedSeconds += metric.quantity
            }
        }
    }
    return summary
}

function isTokenCount(value: number) {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}
