import { z } from 'zod/v3'

export const artifactReferencePageSchema = z
    .object({
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50)
    })
    .strict()
export const artifactReferenceRevisionSchema = z.object({ expectedRevision: z.number().int().positive() }).strict()
export type ArtifactReferencePage = z.output<typeof artifactReferencePageSchema>
export type ArtifactReferenceRevision = z.output<typeof artifactReferenceRevisionSchema>
