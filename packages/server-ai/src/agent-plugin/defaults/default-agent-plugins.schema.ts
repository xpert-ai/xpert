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

export const importDefaultAgentPluginsInput = z.object({}).strict()
