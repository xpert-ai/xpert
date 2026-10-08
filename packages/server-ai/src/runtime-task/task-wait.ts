// Invariants: observes domain state only; never dispatches, cancels or approves work.
// Timing is host-owned. Cancellation removes timers and only ends this observation.
import { TaskDependencyState, TaskWaitMode, TaskWaitPolicy, TaskWaitResult, taskWaitReason } from '@xpert-ai/plugin-sdk'
import { setTimeout as delay } from 'node:timers/promises'

export const DEFAULT_TASK_WAIT_POLICY: Readonly<TaskWaitPolicy> = Object.freeze({
    inlineWaitMs: 2000,
    maxInlineWaitMs: 60_000,
    pollIntervalMs: 500,
    maxWaitMs: 24 * 60 * 60 * 1000,
    unknownGraceMs: 5 * 60 * 1000
})

export interface TaskWaitAdapter<T> {
    read(): Promise<T[]>
    state(task: T): TaskDependencyState
}

/** Reusable by Agent, render, import and workflow adapters; no graph or provider dependency. */
export async function observeTasks<T>(
    adapter: TaskWaitAdapter<T>,
    mode: TaskWaitMode,
    policy: Readonly<TaskWaitPolicy>,
    signal?: AbortSignal
): Promise<TaskWaitResult<T>> {
    const deadline = Date.now() + policy.inlineWaitMs
    for (;;) {
        signal?.throwIfAborted()
        const tasks = await adapter.read()
        signal?.throwIfAborted()
        const reason = taskWaitReason(tasks.map(adapter.state), mode)
        if (reason) return { reason, tasks }
        const remaining = deadline - Date.now()
        if (remaining <= 0) return { reason: 'pending', tasks }
        await delay(Math.min(remaining, policy.pollIntervalMs), undefined, { signal })
    }
}
