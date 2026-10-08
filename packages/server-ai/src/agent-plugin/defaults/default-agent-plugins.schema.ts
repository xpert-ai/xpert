import { z } from 'zod/v3'

// Only IDs select package directories. Other quickstart fields never grant workspace access or credentials.
export const defaultAgentPluginsManifest = z
    .object({
        version: z.literal(1),
        plugins: z
            .array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/) }))
            .min(1)
            .max(100)
    })
    .refine((manifest) => new Set(manifest.plugins.map(({ id }) => id)).size === manifest.plugins.length)

export const importDefaultAgentPluginsInput = z.object({}).strict()
