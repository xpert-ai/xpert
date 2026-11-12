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
        replyToMessageId: z.string().uuid().optional(),
        replyStage: z
            .enum(['progress', 'final'])
            .optional()
            .describe(
                'Required for intent=reply only: progress gives a partial answer and keeps the request open; final completes your answer. Omit for message/request.'
            )
    })
    .strict()
    .refine((input) => (input.intent === 'reply' ? input.replyStage !== undefined : input.replyStage === undefined), {
        path: ['replyStage'],
        message: 'Replies require an explicit replyStage; other intents must omit it'
    })
