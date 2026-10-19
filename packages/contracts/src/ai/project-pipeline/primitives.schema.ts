import { z } from 'zod/v3'

/** Machine keys are independent of translated labels and cannot be prototype properties. */
export const projectPipelineKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/)
  .refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key), 'Reserved key')

export const projectPipelineRefSchema = z
  .string()
  .min(3)
  .max(240)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*@[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)

export type ProjectPipelineJsonValue =
  | string
  | number
  | boolean
  | null
  | ProjectPipelineJsonValue[]
  | { [key: string]: ProjectPipelineJsonValue }

function boundedJson(depth: number): z.ZodType<ProjectPipelineJsonValue> {
  const primitive = z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.null()])
  if (depth === 0) return primitive
  const child = boundedJson(depth - 1)
  return z.union([
    primitive,
    z.array(child).max(1000),
    z
      .record(projectPipelineKeySchema, child)
      .refine((value) => Object.keys(value).length <= 256, 'Too many parameter fields')
  ])
}
export const projectPipelineJsonSchema = boundedJson(8)

export const projectPipelineParticipantKindSchema = z.enum(['assistant', 'runtime_binding', 'human', 'service'])
export const projectPipelineRoleSchema = z
  .object({
    key: projectPipelineKeySchema,
    allowedKinds: z.array(projectPipelineParticipantKindSchema).min(1).max(4)
  })
  .strict()
export const projectPipelineLaneSchema = z
  .object({
    key: projectPipelineKeySchema,
    roleKey: projectPipelineKeySchema,
    label: z.string().min(1).max(240),
    order: z.number().int().nonnegative()
  })
  .strict()
/** Bundled presentation icons only; no executable content or external asset URLs. */
export const projectPipelineIconSchema = z.enum([
  'layers',
  'file-text',
  'folder-open',
  'list-checks',
  'search',
  'scan-search',
  'boxes',
  'package',
  'settings',
  'clipboard-check',
  'shield-check',
  'git-pull-request',
  'code',
  'test-tube',
  'git-merge',
  'calculator',
  'file-check',
  'truck'
])
export const projectPipelineStageSchema = z
  .object({
    key: projectPipelineKeySchema,
    label: z.string().min(1).max(240),
    icon: projectPipelineIconSchema.optional(),
    order: z.number().int().nonnegative()
  })
  .strict()

export const projectPipelineOutputBindingSchema = z
  .object({
    from: z.literal('node_output'),
    nodeKey: projectPipelineKeySchema,
    port: projectPipelineKeySchema
  })
  .strict()

export const projectPipelineInputBindingSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('subject') }).strict(),
  z.object({ from: z.literal('parameter'), key: projectPipelineKeySchema }).strict(),
  projectPipelineOutputBindingSchema,
  z
    .object({ from: z.literal('collection'), items: z.array(projectPipelineOutputBindingSchema).min(1).max(100) })
    .strict()
])

export const projectPipelineEdgeSchema = z
  .object({
    from: projectPipelineKeySchema,
    to: projectPipelineKeySchema,
    outcome: projectPipelineKeySchema.optional()
  })
  .strict()

export type ProjectPipelineInputBinding = z.output<typeof projectPipelineInputBindingSchema>
export type ProjectPipelineParticipantKind = z.output<typeof projectPipelineParticipantKindSchema>
