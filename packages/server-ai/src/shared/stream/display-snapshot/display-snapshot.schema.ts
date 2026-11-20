import type { IChatMessage } from '@xpert-ai/contracts'
import z from 'zod'

const displayMessageSchema = z.object({
    id: z.string(),
    role: z.literal('ai'),
    executionId: z.string(),
    conversationId: z.string().nullish(),
    parentId: z.string().nullish(),
    content: z.custom<IChatMessage['content']>((value) => typeof value === 'string' || Array.isArray(value)),
    reasoning: z.custom<IChatMessage['reasoning']>((value) => value === undefined || Array.isArray(value)).optional(),
    events: z.custom<IChatMessage['events']>((value) => value === undefined || Array.isArray(value)).optional(),
    status: z.custom<IChatMessage['status']>((value) => value === undefined || typeof value === 'string').optional(),
    error: z.string().nullish(),
    agentRuns: z
        .array(
            z.object({
                id: z.string(),
                parentId: z.string().optional(),
                agentKey: z.string().optional(),
                xpertId: z.string().optional(),
                xpertName: z.string().optional(),
                title: z.string().optional(),
                status: z.string().optional(),
                error: z.string().optional(),
                elapsedTime: z.number().optional(),
                createdAt: z.string().optional(),
                updatedAt: z.string().optional()
            })
        )
        .optional()
})
export const runDisplaySnapshotSchema = z.object({
    version: z.literal(1),
    threadId: z.string(),
    runId: z.string(),
    segmentId: z.string(),
    revision: z.number().int().nonnegative(),
    cursor: z.string().regex(/^\d+-\d+$/),
    savedAt: z.string(),
    activeMessageId: z.string(),
    messages: z.array(displayMessageSchema)
})
