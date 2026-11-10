import { z } from 'zod'

export const conversationResourceQuerySchema = z
    .object({
        search: z.string().trim().max(100).default(''),
        typeId: z.string().trim().min(1).max(200).optional(),
        origin: z.enum(['all', 'project', 'shared']).default('all'),
        cursor: z.string().min(1).max(512).optional(),
        limit: z.number().int().min(1).max(100).default(20)
    })
    .strict()

export const conversationResourceCursorSchema = z
    .object({
        source: z.enum(['project', 'shared']),
        offset: z.number().int().min(0).max(1000000),
        scope: z.string().length(64)
    })
    .strict()
