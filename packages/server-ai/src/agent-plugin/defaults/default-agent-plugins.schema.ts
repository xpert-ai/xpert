import { z } from 'zod/v3'

// Explicit relative paths locate nested packages; omitted paths preserve the original flat catalog.
export const defaultAgentPluginsManifest = z
    .object({
        version: z.literal(1),
        plugins: z
            .array(
                z.object({
                    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
                    path: z
                        .string()
                        .max(300)
                        .regex(/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/)
                        .optional()
                })
            )
            .min(1)
            .max(500)
    })
    .refine((manifest) => new Set(manifest.plugins.map(({ id }) => id)).size === manifest.plugins.length)
    .refine((manifest) => new Set(manifest.plugins.map(({ id, path }) => path ?? id)).size === manifest.plugins.length)

export const importDefaultAgentPluginsInput = z.object({ operationId: z.string().uuid().optional() }).strict()

export const defaultAgentPluginsProgress = z.object({
    operationId: z.string().uuid().nullable(),
    phase: z.enum(['idle', 'fetching', 'importing', 'completed', 'failed']),
    commit: z.string().nullable(),
    total: z.number().int().nonnegative(),
    currentId: z.string().nullable(),
    items: z.array(
        z.object({
            id: z.string(),
            status: z.enum(['imported', 'existing', 'repaired', 'failed']),
            packageId: z.string().optional(),
            title: z.string().optional(),
            diagnosticCount: z.number().int().nonnegative().optional(),
            error: z.string().optional()
        })
    ),
    updatedAt: z.string().datetime(),
    error: z.string().optional()
})
