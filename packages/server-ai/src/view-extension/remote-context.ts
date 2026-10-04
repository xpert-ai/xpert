import { z } from 'zod/v3'

/** Full context snapshot sent by the host after access validation. */
export const viewContextEventSchema = z.object({
    type: z.literal('view.context.changed'),
    data: z.object({
        revision: z.number().int().nonnegative(),
        runtimeScope: z.object({ projectId: z.string().nullish(), conversationId: z.string().nullish() })
    })
})
