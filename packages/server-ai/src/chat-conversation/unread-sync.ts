import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import type { IChatConversationUnreadXpertSummary } from '@xpert-ai/contracts'

export const unreadSyncSchema = z
    .object({
        xpertIds: z.array(z.string().uuid()).max(1000),
        version: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional()
    })
    .strict()

/** Stable across database row order; an empty list also has a revision. */
export function unreadSnapshot(items: IChatConversationUnreadXpertSummary[], scope: string[]) {
    const ordered = [...items].sort((a, b) => a.xpertId.localeCompare(b.xpertId))
    return {
        version: createHash('sha256')
            .update(JSON.stringify([scope, ordered]))
            .digest('hex'),
        items: ordered
    }
}
