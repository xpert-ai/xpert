import type { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { isExecutionStopped } from '../../xpert-agent-execution/execution-timing'

/** A wall-clock end cannot be reconstructed from elapsed time across pauses or metadata updates. */
export function projectTaskRuntimeTiming(run?: Pick<XpertAgentExecution, 'status' | 'createdAt' | 'completedAt'>) {
    const start = run?.createdAt?.getTime() ?? NaN
    const end = isExecutionStopped(run?.status) ? (run?.completedAt?.getTime() ?? NaN) : NaN
    return {
        runtimeStatus: run?.status ?? ('unknown' as const),
        runtimeStartedAt: Number.isFinite(start) ? new Date(start).toISOString() : null,
        runtimeCompletedAt:
            Number.isFinite(start) && Number.isFinite(end) && end >= start ? new Date(end).toISOString() : null
    }
}
