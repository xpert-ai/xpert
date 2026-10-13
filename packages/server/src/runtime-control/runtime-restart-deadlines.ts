/** Deadlines cover the serial candidate, recovery boot and drain budgets. */
import type { IRuntimeRestartStatus, RuntimeRestartStatus } from '@xpert-ai/contracts'
import type { RestartOperationMetadata, RestartTargetState } from './runtime-restart.types'
export const REPLICA_RESTART_TIMEOUT_MS = 300_000
const INITIAL_OPERATION_TTL_MS = 15 * 60_000
const OPERATION_DEADLINE_GRACE_MS = 30_000
const OPERATION_STATUS_RETENTION_MS = 15 * 60_000

export function operationDeadlineAt(targetReplicaCount: number, maxConcurrentRestarts: number): string {
	const batchCount = Math.max(1, Math.ceil(targetReplicaCount / maxConcurrentRestarts))
	return new Date(Date.now() + batchCount * REPLICA_RESTART_TIMEOUT_MS + OPERATION_DEADLINE_GRACE_MS).toISOString()
}

export function operationDeadlineError(metadata: RestartOperationMetadata): string | undefined {
	if (!metadata.deadlineAt || Date.now() <= new Date(metadata.deadlineAt).getTime()) return undefined
	return `API runtime restart exceeded its server deadline at ${metadata.deadlineAt}`
}

export function operationStateTtlSeconds(metadata: RestartOperationMetadata): number {
	if (!metadata.deadlineAt) return Math.ceil(INITIAL_OPERATION_TTL_MS / 1_000)
	const remainingExecutionMs = Math.max(0, new Date(metadata.deadlineAt).getTime() - Date.now())
	return Math.ceil((remainingExecutionMs + OPERATION_STATUS_RETENTION_MS) / 1_000)
}

export function restartStatus(
	metadata: RestartOperationMetadata,
	targets: RestartTargetState[]
): IRuntimeRestartStatus {
	const restartId = metadata.restartId
	const failed = targets.filter((target) => target.status === 'failed')
	const completed = targets.filter((target) => target.status === 'completed')
	const completedOperation =
		metadata.phase === 'rolling' &&
		completed.length === metadata.targetReplicaCount &&
		targets.length === metadata.targetReplicaCount
	const deadlineError = !completedOperation && operationDeadlineError(metadata)
	const status: RuntimeRestartStatus = failed.length
		? 'failed'
		: completedOperation
			? 'completed'
			: deadlineError
				? 'failed'
				: 'in_progress'

	return {
		restartId,
		mode: 'rolling-self-signal',
		status,
		requestedAt: metadata.requestedAt,
		targetReplicaCount: metadata.phase === 'collecting' ? targets.length : metadata.targetReplicaCount,
		completedReplicaCount: completed.length,
		failedReplicaCount: failed.length || (deadlineError ? 1 : 0),
		pluginGeneration: metadata.pluginGeneration,
		...(failed[0]?.error || deadlineError ? { error: failed[0]?.error ?? deadlineError } : {})
	}
}
