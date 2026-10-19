import { z } from 'zod/v3'
import { projectPipelineKeySchema, projectPipelineRefSchema } from './primitives.schema'

const reference = { ref: projectPipelineRefSchema }
export const projectPipelinePortDescriptorSchema = z
  .object({
    schemaRef: projectPipelineRefSchema,
    cardinality: z.enum(['one', 'collection'])
  })
  .strict()

/** Declarations allow configuration checks. They never prove a runtime executor is currently available. */
export const projectPipelineExtensionDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({ ...reference, kind: z.literal('schema') }).strict(),
  z.object({ ...reference, kind: z.literal('resource') }).strict(),
  z.object({ ...reference, kind: z.literal('subject'), outputSchemaRef: projectPipelineRefSchema }).strict(),
  z
    .object({
      ...reference,
      kind: z.literal('operation'),
      effects: z.enum(['read_only', 'isolated_write', 'external_write']),
      idempotency: z.enum(['read_only', 'keyed_receipt']),
      retry: z.enum(['never', 'after_confirmed_failure']).optional(),
      requiredCapabilities: z.array(projectPipelineKeySchema).max(100),
      inputs: z.record(projectPipelineKeySchema, projectPipelinePortDescriptorSchema),
      outputs: z.record(projectPipelineKeySchema, projectPipelineRefSchema)
    })
    .strict(),
  z.object({ ...reference, kind: z.literal('completion') }).strict(),
  z
    .object({ ...reference, kind: z.literal('policy'), outcomes: z.array(projectPipelineKeySchema).min(1).max(32) })
    .strict(),
  z.object({ ...reference, kind: z.literal('projection') }).strict(),
  z.object({ ...reference, kind: z.literal('presentation') }).strict(),
  z.object({ ...reference, kind: z.literal('action') }).strict(),
  z.object({ ...reference, kind: z.literal('metric') }).strict(),
  z.object({ ...reference, kind: z.literal('dimension') }).strict(),
  z.object({ ...reference, kind: z.literal('trigger') }).strict(),
  z
    .object({
      ...reference,
      kind: z.literal('subscription'),
      outputs: z.record(projectPipelineKeySchema, projectPipelineRefSchema)
    })
    .strict()
])

export type ProjectPipelineExtensionDescriptor = z.output<typeof projectPipelineExtensionDescriptorSchema>
export type ProjectPipelineExtensionKind = ProjectPipelineExtensionDescriptor['kind']

export interface ProjectPipelineConfigurationCheck {
  valid: boolean
  /** Configuration checking never saves a binding, invokes a resolver or starts work. */
  runtimeReadiness: 'not_checked'
  issues: Array<{ code: string; path: Array<string | number>; ref?: string }>
  requiredCapabilities: Array<{ executorSlot: string; capabilities: string[] }>
}
