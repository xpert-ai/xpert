import { z } from 'zod/v3'
import { resourceAnalysisPolicySchema } from '@xpert-ai/plugin-sdk/analytics'

// Only request data belongs here. Actor, source Project and target Project are resolved by the host.
export const offerArtifactUseGrantSchema = z
    .object({
        artifactId: z.string().uuid(),
        versionId: z.string().uuid(),
        targetGroupId: z.string().uuid(),
        analysis: resourceAnalysisPolicySchema.optional(),
        expiresAt: z
            .string()
            .datetime({ offset: true })
            .transform((value) => new Date(value))
    })
    .strict()

export const changeArtifactUseGrantSchema = z
    .object({
        grantId: z.string().uuid(),
        expectedRevision: z.number().int().positive()
    })
    .strict()

export const acceptArtifactUseGrantSchema = changeArtifactUseGrantSchema
    .extend({ acceptAnalysis: z.boolean().default(false), acceptDelegatedResults: z.boolean().default(false) })
    .strict()

export const readArtifactUseGrantSchema = z
    .object({
        grantId: z.string().uuid(),
        groupId: z.string().uuid(),
        projectId: z.string().uuid()
    })
    .strict()

export type OfferArtifactUseGrant = z.output<typeof offerArtifactUseGrantSchema>
export type ChangeArtifactUseGrant = z.output<typeof changeArtifactUseGrantSchema>
export type AcceptArtifactUseGrant = z.output<typeof acceptArtifactUseGrantSchema>
export type ReadArtifactUseGrant = z.output<typeof readArtifactUseGrantSchema>
