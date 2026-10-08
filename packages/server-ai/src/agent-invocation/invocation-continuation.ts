import type { CheckpointTuple } from '@langchain/langgraph-checkpoint'
import { z } from 'zod/v3'

const interrupt = z.object({
    id: z.string().min(1),
    value: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('agent_invocation'),
            invocationId: z.string().min(1),
            interaction: z.object({ id: z.string() }).optional()
        }),
        z.object({
            type: z.literal('task_wait'),
            waitId: z.string().min(1),
            interaction: z.object({ id: z.string() }).optional()
        })
    ])
})

/** Select only the matching runtime interrupt. Never approve unrelated human interactions. */
export function invocationInterrupt(tuple: CheckpointTuple | undefined, invocationId: string) {
    for (const [, channel, value] of tuple?.pendingWrites ?? []) {
        if (channel !== '__interrupt__') continue
        for (const candidate of Array.isArray(value) ? value : [value]) {
            const parsed = interrupt.safeParse(candidate)
            if (parsed.success) {
                const value = parsed.data.value
                if ((value.type === 'task_wait' ? value.waitId : value.invocationId) === invocationId)
                    return parsed.data.id
            }
        }
    }
    return null
}

export interface AgentInvocationResumeFence {
    /** Optional only for historical callers; new durable dispatches must carry their claim. */
    waitLeaseToken?: string
    invocationId: string
    checkpointNamespace: string
    checkpointId: string
    interruptId: string
}

export function matchesInvocationResume(tuple: CheckpointTuple | undefined, fence: AgentInvocationResumeFence) {
    return (
        tuple?.checkpoint.id === fence.checkpointId &&
        invocationWaitInteraction(tuple, fence.invocationId) === undefined &&
        invocationInterrupt(tuple, fence.invocationId) === fence.interruptId
    )
}

export function invocationWaitInteraction(tuple: CheckpointTuple | undefined, id: string) {
    for (const [, channel, value] of tuple?.pendingWrites ?? []) {
        if (channel !== '__interrupt__') continue
        for (const candidate of Array.isArray(value) ? value : [value]) {
            const parsed = interrupt.safeParse(candidate)
            if (!parsed.success) continue
            const current = parsed.data.value
            if ((current.type === 'task_wait' ? current.waitId : current.invocationId) === id)
                return current.interaction?.id
        }
    }
    return undefined
}
