import { z } from 'zod/v3'

/** Credential support for durable pipeline commands; Project permissions remain independently required. */
export const projectPipelineCommandCapabilitySchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }).strict(),
  z.object({ allowed: z.literal(false), reason: z.literal('PIPELINE_SCOPED_DELEGATION_UNAVAILABLE') }).strict()
])
export type ProjectPipelineCommandCapability = z.output<typeof projectPipelineCommandCapabilitySchema>
