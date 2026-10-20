import { z } from 'zod/v3'
import { projectPipelineKeySchema, projectPipelineRefSchema } from './primitives.schema'
import { projectPipelineBindingSchema } from './configuration.schema'

const scopedIdentity = {
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  projectId: z.string().uuid()
}
const definitionRef = z
  .object({
    templateRef: projectPipelineRefSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()

export const projectPipelineProjectBindingSchema = z
  .object({
    ...scopedIdentity,
    definition: definitionRef,
    revision: z.number().int().positive(),
    configuration: projectPipelineBindingSchema
  })
  .strict()

export const projectPipelineInstanceSchema = z.discriminatedUnion('executionAuthority', [
  z
    .object({
      ...scopedIdentity,
      executionAuthority: z.literal('provider'),
      providerRef: projectPipelineRefSchema,
      sourceKey: z.string().min(1).max(500),
      definition: definitionRef,
      subject: z.object({ resolverRef: projectPipelineRefSchema, objectKey: z.string().min(1).max(500) }).strict(),
      revision: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      ...scopedIdentity,
      executionAuthority: z.literal('platform'),
      bindingId: z.string().uuid(),
      sourceKey: z.string().min(1).max(500),
      definition: definitionRef,
      subject: z.object({ resolverRef: projectPipelineRefSchema, objectKey: z.string().min(1).max(500) }).strict(),
      revision: z.number().int().nonnegative()
    })
    .strict()
])

export const projectPipelineRunSchema = z
  .object({
    ...scopedIdentity,
    instanceId: z.string().uuid(),
    triggerKey: z.string().min(1).max(500),
    definition: definitionRef,
    bindingSnapshot: projectPipelineBindingSchema,
    state: z.enum(['pending', 'active', 'waiting', 'cancelling', 'completed', 'failed', 'cancelled', 'superseded']),
    revision: z.number().int().nonnegative(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable()
  })
  .strict()

export const projectPipelineSubjectVersionSchema = z
  .object({
    resolverRef: projectPipelineRefSchema,
    objectKey: z.string().min(1).max(500),
    version: z.string().min(1).max(500),
    digest: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()

/** Scope and ownership are resolved by the host; possession of this reference grants no access. */
export const projectPipelineEvidenceRefSchema = projectPipelineSubjectVersionSchema
  .extend({
    schemaRef: projectPipelineRefSchema,
    producerOperationId: z.string().uuid().optional()
  })
  .strict()

export const projectPipelineNodeStateSchema = z
  .object({
    lifecycle: z.enum(['pending', 'active', 'completed', 'failed', 'cancelled']),
    readiness: z.enum(['waiting', 'ready', 'blocked']),
    applicability: z.enum(['undetermined', 'selected', 'excluded']),
    freshness: z.enum(['current', 'superseded']),
    runtime: z.enum([
      'none',
      'queued',
      'running',
      'waiting',
      'cancelling',
      'succeeded',
      'failed',
      'cancelled',
      'unknown'
    ])
  })
  .strict()

export const projectPipelineWorkContextSchema = z
  .object({
    instanceId: z.string().uuid(),
    runId: z.string().uuid(),
    roundId: z.string().uuid(),
    nodeInstanceId: z.string().uuid(),
    operationId: z.string().uuid(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    generation: z.number().int().positive()
  })
  .strict()

export const projectPipelineRoundSchema = z
  .object({
    ...scopedIdentity,
    runId: z.string().uuid(),
    sequence: z.number().int().positive(),
    generation: z.number().int().positive(),
    state: z.enum(['active', 'completed', 'awaiting_new_subject', 'failed', 'cancelled', 'superseded']),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    subjectVersionSet: z.array(projectPipelineSubjectVersionSchema).min(1).max(100),
    supersedes: z.string().uuid().nullable()
  })
  .strict()

export const projectPipelineNodeInstanceSchema = z
  .object({
    ...scopedIdentity,
    roundId: z.string().uuid(),
    nodeKey: projectPipelineKeySchema,
    /** Stable source identity; never a list index. */
    expansionKey: z.string().min(1).max(500),
    laneKey: projectPipelineKeySchema.nullable(),
    stageKey: projectPipelineKeySchema,
    state: projectPipelineNodeStateSchema,
    taskIds: z.array(z.string().uuid()).max(100),
    evidence: z.array(projectPipelineEvidenceRefSchema).max(100),
    revision: z.number().int().nonnegative()
  })
  .strict()

export type ProjectPipelineSubjectVersion = z.output<typeof projectPipelineSubjectVersionSchema>
export type ProjectPipelineProjectBinding = z.output<typeof projectPipelineProjectBindingSchema>
export type ProjectPipelineInstance = z.output<typeof projectPipelineInstanceSchema>
export type ProjectPipelineRun = z.output<typeof projectPipelineRunSchema>
export type ProjectPipelineEvidenceRef = z.output<typeof projectPipelineEvidenceRefSchema>
export type ProjectPipelineNodeState = z.output<typeof projectPipelineNodeStateSchema>
export type ProjectPipelineWorkContext = z.output<typeof projectPipelineWorkContextSchema>
export type ProjectPipelineRound = z.output<typeof projectPipelineRoundSchema>
export type ProjectPipelineNodeInstance = z.output<typeof projectPipelineNodeInstanceSchema>
