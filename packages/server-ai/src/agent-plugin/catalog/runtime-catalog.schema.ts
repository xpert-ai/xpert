import { z } from 'zod/v3'

export const runtimeCatalogQuerySchema = z
    .object({
        projectId: z.string().uuid().optional(),
        search: z.string().max(200).optional(),
        kind: z.enum(['agent_plugin', 'middleware', 'external_xpert']).optional(),
        purpose: z.enum(['browse', 'selection']).optional(),
        references: z
            .preprocess(
                (value) => {
                    if (typeof value !== 'string') return value
                    try {
                        return JSON.parse(value)
                    } catch {
                        return null
                    }
                },
                z
                    .array(
                        z
                            .object({
                                bindingId: z.string().uuid(),
                                version: z.string().regex(/^[a-f0-9]{64}$/)
                            })
                            .strict()
                    )
                    .max(50)
            )
            .optional(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50)
    })
    .strict()
    .refine(
        (value) =>
            !value.references ||
            (value.purpose === 'selection' &&
                !value.search &&
                !value.kind &&
                value.offset === 0 &&
                new Set(value.references.map((item) => item.bindingId)).size === value.references.length)
    )
