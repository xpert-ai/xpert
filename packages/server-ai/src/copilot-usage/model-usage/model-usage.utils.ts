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

    const keys = new Set<string>()
    return metrics.map((metric) => {
        const key = modelUsageMetricKey(metric)
        if (keys.has(key)) {
            throw new Error(
                t('server-ai:Error.ModelUsageDuplicateMetricUnit', {
                    unit: metric.unit,
                    defaultValue: `Duplicate model usage metric key '${key}'. Provide a distinct key for each component or item.`
                })
            )
        }
        keys.add(key)

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
            return metric.key === key ? metric : { ...metric, key }
        }

        if (!Number.isFinite(metric.quantity) || metric.quantity <= 0) {
            throw new Error(
                t('server-ai:Error.ModelUsageQuantityInvalid', {
                    unit: metric.unit,
                    defaultValue: `Model usage quantity for '${metric.unit}' must be positive.`
                })
            )
        }
        if (metric.unit !== 'second' && !Number.isInteger(metric.quantity)) {
            throw new Error(
                t('server-ai:Error.ModelUsageGenerationQuantityInvalid', {
                    defaultValue: `Model usage quantity for '${metric.unit}' must be a positive integer.`
                })
            )
        }
        return metric.key === key ? metric : { ...metric, key }
    })
}

export function modelUsageMetricKey(metric: ModelUsageMetric) {
    const explicitKey = metric.key?.trim()
    if (metric.key !== undefined && !explicitKey) {
        throw new Error('Model usage metric key must not be empty.')
    }
    const key = explicitKey ?? (metric.component ? `${metric.component}:${metric.unit}` : metric.unit)
    if (key.length > 191) {
        throw new Error('Model usage metric key must not exceed 191 characters.')
    }
    return key
}

function isTokenCount(value: number) {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}
