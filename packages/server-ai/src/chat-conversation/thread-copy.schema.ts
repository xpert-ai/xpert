import { z } from 'zod'

// Bodyless copies keep the legacy idle-only contract; explicit fork boundaries require retry identities.
export const threadCopySchema = z
    .object({
        metadata: z.record(z.unknown()).optional(),
        beforeMessageId: z.string().trim().min(1).max(100).optional(),
        requestId: z.string().trim().min(1).max(100).optional(),
        mode: z.literal('latest-sealed-reply').optional()
    })
    .strict()
    .refine((input) => !(input.mode && input.beforeMessageId), 'Choose one branch boundary.')
    .refine((input) => !(input.mode || input.beforeMessageId) || !!input.requestId, 'A requestId is required.')
    .default({})

export type CopyConversationThreadInput = z.output<typeof threadCopySchema>
