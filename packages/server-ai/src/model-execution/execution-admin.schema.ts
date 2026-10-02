import { z } from 'zod/v3'

export const executionPendingQuerySchema = z
    .object({
        take: z.coerce.number().int().min(1).max(100).default(50),
        skip: z.coerce.number().int().min(0).max(100000).default(0)
    })
    .strict()

export type ExecutionPendingQuery = z.output<typeof executionPendingQuerySchema>
