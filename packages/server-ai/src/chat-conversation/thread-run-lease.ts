// A lease proves process ownership, not checkpoint or message durability.
// Expiry ends an unfinalized run; it must never manufacture a resumable pause.
import z from 'zod'

export const RUN_LEASE_KEY = 'chatkitRunLease'
export const RUN_LEASE_MS = 90_000
const leaseSchema = z.object({ owner: z.string(), executionId: z.string(), expiresAt: z.string().datetime() })
export type ThreadRunLease = z.infer<typeof leaseSchema>

export function readRunLease(metadata?: Record<string, unknown>): ThreadRunLease | null {
    const result = leaseSchema.safeParse(metadata?.[RUN_LEASE_KEY])
    return result.success ? result.data : null
}

export function clearRunLease(thread: { metadata?: Record<string, unknown> }) {
    const { [RUN_LEASE_KEY]: _lease, ...metadata } = thread.metadata ?? {}
    thread.metadata = metadata
}
