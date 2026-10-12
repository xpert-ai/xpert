import { z } from 'zod/v3'

/** Shared boundary validation for HTTP, Views and Assistant task-plan tools. */
export const projectTaskPlanSchema = z
    .object({
        taskId: z.string().uuid(),
        expectedRevision: z.number().int().positive(),
        parentTaskId: z.string().uuid().nullable().optional(),
        predecessorIds: z.array(z.string().uuid()).optional(),
        plannedStartAt: z.string().datetime().nullable().optional(),
        plannedEndAt: z.string().datetime().nullable().optional(),
        estimatedDurationMs: z.number().finite().nonnegative().nullable().optional()
    })
    .strict()
