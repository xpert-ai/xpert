import { z } from 'zod'
import type { TChatExecutionRecovery } from '@xpert-ai/contracts'

const checkpoint = z.object({ threadId: z.string().min(1), checkpointNs: z.string(), checkpointId: z.string().min(1) })
const recoverySchema = z.object({
    version: z.literal(1),
    graphRevision: z.string().min(1),
    input: checkpoint.optional(),
    latest: checkpoint
})

/** Persistence boundary: malformed/legacy JSON must never create a recovery grant. */
export function readExecutionRecovery(value: unknown): TChatExecutionRecovery | null {
    const parsed = recoverySchema.safeParse(value)
    return parsed.success ? (parsed.data as TChatExecutionRecovery) : null
}
