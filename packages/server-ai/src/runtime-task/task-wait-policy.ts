import { TaskWaitPolicy } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { DEFAULT_TASK_WAIT_POLICY } from './task-wait'

/** Operator caps remain authoritative even when an Agent chooses its next observation window. */
export function readTaskWaitPolicy(env: NodeJS.ProcessEnv): Readonly<TaskWaitPolicy> {
    const number = (value: string | undefined, fallback: number, min: number, max: number) =>
        z.coerce
            .number()
            .int()
            .min(min)
            .max(max)
            .parse(value ?? fallback)
    const policy: TaskWaitPolicy = {
        inlineWaitMs: number(env.XPERT_TASK_INLINE_WAIT_MS, DEFAULT_TASK_WAIT_POLICY.inlineWaitMs, 0, 30_000),
        maxInlineWaitMs: number(
            env.XPERT_TASK_MAX_INLINE_WAIT_MS,
            DEFAULT_TASK_WAIT_POLICY.maxInlineWaitMs,
            1000,
            60_000
        ),
        pollIntervalMs: number(env.XPERT_TASK_POLL_INTERVAL_MS, DEFAULT_TASK_WAIT_POLICY.pollIntervalMs, 100, 5000),
        maxWaitMs: number(env.XPERT_TASK_MAX_WAIT_MS, DEFAULT_TASK_WAIT_POLICY.maxWaitMs, 1000, 7 * 24 * 3600_000),
        unknownGraceMs: number(
            env.XPERT_TASK_UNKNOWN_GRACE_MS,
            DEFAULT_TASK_WAIT_POLICY.unknownGraceMs,
            1000,
            24 * 3600_000
        )
    }
    if (policy.unknownGraceMs > policy.maxWaitMs)
        throw new Error('Task unknown grace must not exceed the wait deadline')
    return Object.freeze(policy)
}
export const HOST_TASK_WAIT_POLICY = readTaskWaitPolicy(process.env)
