import type { ModelExecutionPolicy } from '@xpert-ai/contracts'
import { executionError } from './execution-errors'

/** A new grant pins its duration. Later configuration changes never extend an active attempt. */
export function resolveExecutionDuration(policy: ModelExecutionPolicy, requested?: number): number {
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested < 1 || requested > 86400))
        throw executionError('Invalid')
    return Math.min(requested ?? policy.defaultDurationSeconds ?? policy.limits.maxDurationSeconds,
        policy.limits.maxDurationSeconds)
}

export function remainingExecutionSeconds(grant: { absoluteExpiresAt: Date }): number {
    const remaining = Math.floor((grant.absoluteExpiresAt.getTime() - Date.now()) / 1000)
    if (!Number.isFinite(remaining) || remaining < 1) throw executionError('Denied')
    return remaining
}
