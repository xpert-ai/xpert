import { z } from 'zod/v3'
import {
  projectPipelineInputBindingSchema,
  projectPipelineKeySchema,
  projectPipelineRefSchema
} from './primitives.schema'

const base = {
  key: projectPipelineKeySchema,
  label: z.string().min(1).max(240).optional(),
  stageKey: projectPipelineKeySchema,
  inputBindings: z.record(projectPipelineKeySchema, projectPipelineInputBindingSchema).optional(),
  outputPorts: z.record(projectPipelineKeySchema, projectPipelineRefSchema).optional()
}
const outcomes = z.array(projectPipelineKeySchema).min(2).max(32)

/** Only explicit primitives can control flow; configuration cannot embed executable expressions. */
export const projectPipelineNodeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('work'),
      laneKey: projectPipelineKeySchema,
      operationRef: projectPipelineRefSchema,
      executorSlot: projectPipelineKeySchema,
      completionRef: projectPipelineRefSchema,
      resourceResolverRef: projectPipelineRefSchema.optional(),
      outputSchemaRef: projectPipelineRefSchema.optional()
    })
    .strict(),
  z.object({ ...base, kind: z.literal('fork') }).strict(),
  z
    .object({
      ...base,
      kind: z.literal('join'),
      join: z.object({ mode: z.literal('all_selected'), accept: z.literal('completed') }).strict()
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('router'),
      policyRef: projectPipelineRefSchema,
      outcomes,
      unmatched: z.literal('block')
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('human_gate'),
      laneKey: projectPipelineKeySchema,
      policyRef: projectPipelineRefSchema,
      candidateRoleKey: projectPipelineKeySchema,
      outcomes,
      outcomeLabels: z.record(projectPipelineKeySchema, z.string().min(1).max(120)).optional()
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('external_wait'),
      laneKey: projectPipelineKeySchema,
      subscriptionRef: projectPipelineRefSchema
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('terminal'),
      outcome: projectPipelineKeySchema,
      disposition: z.enum(['complete', 'await_new_subject']).optional()
    })
    .strict()
])

export type ProjectPipelineNodeDefinition = z.output<typeof projectPipelineNodeSchema>
