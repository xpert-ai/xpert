import type {
    IModelInvocation,
    ModelInvocationProviderState,
    ModelInvocationUsageAvailability,
    ModelInvocationUsageSummary,
    ModelUsageMetric
} from '@xpert-ai/contracts'
import { t } from 'i18next'

const TERMINAL_STATES = new Set<ModelInvocationProviderState>([
    'succeeded',
    'failed',
    'cancelled',
    'acceptance_unknown'
])

const STATE_RANK: Record<ModelInvocationProviderState, number> = {
    started: 0,
    submitted: 1,
    processing: 2,
    succeeded: 3,
    failed: 3,
    cancelled: 3,
    acceptance_unknown: 3
}

export function isTerminalModelInvocationState(state: ModelInvocationProviderState): boolean {
    return TERMINAL_STATES.has(state)
}

export function canAdvanceModelInvocationState(
    current: ModelInvocationProviderState,
    next: ModelInvocationProviderState
): boolean {
    if (current === 'acceptance_unknown') {
        return next !== 'started'
    }
    if (isTerminalModelInvocationState(current)) {
        return current === next
    }
    return STATE_RANK[next] >= STATE_RANK[current]
}

export function normalizeModelInvocationMetrics(
    metrics: ModelUsageMetric[] | undefined,
    availability: ModelInvocationUsageAvailability,
    state: ModelInvocationProviderState
): ModelUsageMetric[] | null {
    if (availability !== 'available') {
        if (metrics?.length) {
            throw new Error(
                t('server-ai:Error.ModelInvocationMetricsAvailabilityRequired', {
                    defaultValue: 'Usage metrics require availability "available"'
                }) || 'Usage metrics require availability "available"'
            )
        }
        return null
    }
    if (!metrics?.length) {
        throw new Error(
            t('server-ai:Error.ModelInvocationMetricRequired', {
                defaultValue: 'Available usage requires at least one metric'
            }) || 'Available usage requires at least one metric'
        )
    }

    const units = new Set<ModelUsageMetric['unit']>()
    return metrics.map((metric) => {
        if (units.has(metric.unit)) {
            throw new Error(
                t('server-ai:Error.ModelInvocationDuplicateMetricUnit', {
                    unit: metric.unit,
                    defaultValue: 'Duplicate usage metric unit "{{unit}}"'
                }) || `Duplicate usage metric unit "${metric.unit}"`
            )
        }
        units.add(metric.unit)

        if (metric.unit === 'token') {
            const values = [metric.promptTokens, metric.completionTokens, metric.totalTokens]
            if (values.every((value) => value === undefined)) {
                throw new Error(
                    t('server-ai:Error.ModelInvocationTokenFieldRequired', {
                        defaultValue: 'Token usage requires at least one token field'
                    }) || 'Token usage requires at least one token field'
                )
            }
            if (values.some((value) => value !== undefined && !isTokenCount(value))) {
                throw new Error(
                    t('server-ai:Error.ModelInvocationTokenCountInvalid', {
                        defaultValue: 'Token counts must be finite non-negative integers'
                    }) || 'Token counts must be finite non-negative integers'
                )
            }
            return { ...metric }
        }

        if ((metric.authority === 'request' || metric.authority === 'contract') && state !== 'succeeded') {
            throw new Error(
                t('server-ai:Error.ModelInvocationSuccessfulAuthorityRequired', {
                    defaultValue: 'Request or contract usage requires Provider success'
                }) || 'Request or contract usage requires Provider success'
            )
        }
        if (metric.unit === 'generation') {
            if (!Number.isInteger(metric.quantity) || metric.quantity <= 0) {
                throw new Error(
                    t('server-ai:Error.ModelInvocationGenerationQuantityInvalid', {
                        defaultValue: 'Generation quantity must be a positive integer'
                    }) || 'Generation quantity must be a positive integer'
                )
            }
            return { ...metric }
        }
        if (!Number.isFinite(metric.quantity) || metric.quantity <= 0) {
            throw new Error(
                t('server-ai:Error.ModelInvocationSecondQuantityInvalid', {
                    defaultValue: 'Second quantity must be a positive finite number'
                }) || 'Second quantity must be a positive finite number'
            )
        }
        return { ...metric }
    })
}

export function emptyModelInvocationUsageSummary(): ModelInvocationUsageSummary {
    return {
        videoPromptTokens: 0,
        videoCompletionTokens: 0,
        videoTokens: 0,
        videoGenerations: 0,
        generatedSeconds: 0,
        pendingVideoInvocations: 0,
        unknownVideoUsage: 0
    }
}

export function addModelInvocationUsageSummaries(
    left: ModelInvocationUsageSummary,
    right: ModelInvocationUsageSummary
): ModelInvocationUsageSummary {
    return {
        videoPromptTokens: left.videoPromptTokens + right.videoPromptTokens,
        videoCompletionTokens: left.videoCompletionTokens + right.videoCompletionTokens,
        videoTokens: left.videoTokens + right.videoTokens,
        videoGenerations: left.videoGenerations + right.videoGenerations,
        generatedSeconds: left.generatedSeconds + right.generatedSeconds,
        pendingVideoInvocations: left.pendingVideoInvocations + right.pendingVideoInvocations,
        unknownVideoUsage: left.unknownVideoUsage + right.unknownVideoUsage
    }
}

export function summarizeModelInvocations(invocations: IModelInvocation[]): ModelInvocationUsageSummary {
    const summary = emptyModelInvocationUsageSummary()
    const seen = new Set<string>()

    for (const invocation of invocations) {
        const identity =
            invocation.id ?? `${invocation.tenantId ?? ''}:${invocation.originExecutionId}:${invocation.invocationKey}`
        if (seen.has(identity)) {
            continue
        }
        seen.add(identity)

        if (!isTerminalModelInvocationState(invocation.providerState) || invocation.usageAvailability === 'pending') {
            summary.pendingVideoInvocations += 1
        }
        if (invocation.usageAvailability === 'unknown') {
            summary.unknownVideoUsage += 1
        }
        if (invocation.usageAvailability !== 'available') {
            continue
        }

        for (const metric of invocation.metrics ?? []) {
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

function isTokenCount(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}
