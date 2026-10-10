import { z } from 'zod'

/**
 * Model-visible tool arguments contain content and routing intent only.
 * Caller identity, root user and publication identity come from the bound runtime.
 * The shared groupSendSchema enforces each intent after host metadata is attached.
 */
export const groupToolInputSchema = z
    .object({
        intent: z.enum(['request', 'reply', 'message']),
        text: z.string().min(1).max(32000),
        recipientIds: z.array(z.string().uuid()).max(16).optional(),
        replyToMessageId: z.string().uuid().optional()
    })
    .strict()
