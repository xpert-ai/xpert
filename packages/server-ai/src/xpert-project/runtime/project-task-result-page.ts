import { z } from 'zod/v3'

export const taskResultReadSchema = z
    .object({
        taskId: z.string().uuid(),
        executionId: z.string().uuid(),
        source: z.enum(['report', 'prompt']).optional(),
        expectedRevision: z.number().int().nonnegative(),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(12000).default(6000)
    })
    .strict()
export type TaskResultRead = z.output<typeof taskResultReadSchema>
