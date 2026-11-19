import { z } from 'zod/v3'

export const taskResultReadSchema = z
    .object({
        taskId: z.string().uuid(),
        executionId: z.string().uuid(),
        source: z.enum(['report', 'prompt']).optional(),
        expectedRevision: z.number().int().nonnegative().optional(),
        offset: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(12000).default(6000)
    })
    .strict()
    .superRefine((input, context) => {
        if (input.source !== 'prompt' && input.expectedRevision === undefined)
            context.addIssue({
                code: 'custom',
                path: ['expectedRevision'],
                message: 'Report pages require the observed invocation revision'
            })
    })
export type TaskResultRead = z.output<typeof taskResultReadSchema>
