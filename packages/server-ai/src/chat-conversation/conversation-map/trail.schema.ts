import { z } from 'zod'
export { trailGraphSchema } from '@xpert-ai/contracts'
export type {
    TrailGraph,
    TrailLane,
    TrailStep,
    TrailEpisode,
    TrailStatus,
    TrailActivityKind
} from '@xpert-ai/contracts'

export const trailQuerySchema = z
    .object({
        operation: z.literal('trail'),
        conversationId: z.string().uuid(),
        threadId: z.string().min(1).max(100).optional(),
        messageId: z.string().uuid().optional(),
        showHistory: z.boolean().default(false)
    })
    .strict()
export type TrailQuery = z.infer<typeof trailQuerySchema>
