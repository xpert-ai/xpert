import { z } from 'zod'

export const artifactPresentationSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/)
export const artifactPresentationQuerySchema = z
    .object({
        target: z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
        operation: z.string().min(1).max(80),
        input: z.record(z.unknown())
    })
    .strict()

type PresentationQueryOutput = z.output<typeof artifactPresentationQuerySchema>
// These fields are required by Zod even when this package disables strictNullChecks.
export type ArtifactPresentationQueryInput = Required<Omit<PresentationQueryOutput, 'target'>> & {
    target: Required<PresentationQueryOutput['target']>
}
