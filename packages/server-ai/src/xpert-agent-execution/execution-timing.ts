import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import type { XpertAgentExecution } from './agent-execution.entity'

export function isExecutionStopped(status: Status | undefined): boolean {
    return [Status.SUCCESS, Status.ERROR, Status.TIMEOUT, Status.INTERRUPTED].includes(status)
}

/** Lifecycle owns this timestamp: stale snapshots and later metadata writes must not move it. */
export function executionCompletedAt(
    previous: Pick<XpertAgentExecution, 'status' | 'completedAt'> | undefined,
    nextStatus: Status | undefined
): Date | null {
    if (nextStatus === Status.RUNNING || nextStatus === Status.PENDING) return null
    if (isExecutionStopped(nextStatus) && !isExecutionStopped(previous?.status)) return new Date()
    // Legacy stopped records have an unknown end; a metadata write cannot establish it.
    return previous?.completedAt ?? null
}
