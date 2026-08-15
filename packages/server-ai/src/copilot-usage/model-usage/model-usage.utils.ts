import type { ModelUsageMetric } from '@xpert-ai/contracts'
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

function isTokenCount(value: number) {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}
