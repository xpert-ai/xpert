import { z } from 'zod/v3'
export const packageIdSchema = z.string().uuid()
export const updatePluginInput = z
    .object({
        branch: z
            .string()
            .trim()
            .min(1)
            .max(240)
            .regex(/^[^\s~^:?*\[\\]+$/)
            .optional(),
        operationId: z.string().uuid().optional()
    })
    .strict()
    .refine((input) => !input.operationId || !input.branch, 'A resume cannot change its branch')
export const cleanupPluginsInput = z.object({ packageIds: z.array(z.string().uuid()).max(100) }).strict()
export const updateProgressSchema = z
    .object({
        operationId: z.string().uuid().nullable(),
        packageId: z.string().uuid().nullable(),
        branch: z.string().nullable(),
        commit: z
            .string()
            .regex(/^[a-f\d]{40,64}$/)
            .nullable(),
        phase: z.enum(['idle', 'updating', 'completed', 'failed']),
        result: z
            .object({ packageId: z.string().uuid(), status: z.enum(['imported', 'existing', 'repaired']) })
            .optional(),
        error: z.string().optional()
    })
    .strict()
