import { z } from 'zod/v3'
import { projectPipelineRefSchema } from './primitives.schema'

/** Keys identify actual resources across Projects/tenants, never caller-supplied aliases or paths. */
export const projectPipelineResourceClaimSchema = z
  .object({
    key: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.enum(['shared', 'exclusive'])
  })
  .strict()

export const projectPipelineResourceClaimsSchema = z
  .array(projectPipelineResourceClaimSchema)
  .min(1)
  .max(32)
  .superRefine((claims, context) => {
    if (new Set(claims.map((claim) => claim.key)).size !== claims.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'RESOURCE_KEYS_MUST_BE_UNIQUE' })
  })
  .transform((claims) => [...claims].sort((left, right) => left.key.localeCompare(right.key)))

export const projectPipelineResourceReservationSchema = z
  .object({
    resolverRef: projectPipelineRefSchema,
    claims: projectPipelineResourceClaimsSchema
  })
  .strict()

export type ProjectPipelineResourceClaim = z.output<typeof projectPipelineResourceClaimSchema>
export type ProjectPipelineResourceReservation = z.output<typeof projectPipelineResourceReservationSchema>
