import { z } from 'zod/v3'
import { projectPipelineConfigurationSchema } from './configuration.schema'
import { projectPipelineKeySchema } from './primitives.schema'
import { projectPipelineEvidenceRefSchema } from './runtime.schema'

export const projectPipelineConfigureSchema = z
  .object({
    requestId: z.string().uuid(),
    configuration: projectPipelineConfigurationSchema
  })
  .strict()
export const projectPipelineStartSchema = z
  .object({
    bindingId: z.string().uuid(),
    objectKey: z.string().min(1).max(500),
    triggerKey: z.string().min(1).max(500),
    title: z.string().min(1).max(1000)
  })
  .strict()
export type ProjectPipelineConfigure = z.output<typeof projectPipelineConfigureSchema>
export type ProjectPipelineStart = z.output<typeof projectPipelineStartSchema>
export const projectPipelineDecisionSchema = z
  .object({
    requestId: z.string().uuid(),
    attentionId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    generation: z.number().int().positive(),
    outcome: projectPipelineKeySchema,
    evidence: z.array(projectPipelineEvidenceRefSchema).max(100)
  })
  .strict()
export type ProjectPipelineDecision = z.output<typeof projectPipelineDecisionSchema>
export const projectPipelineNextRoundSchema = z
  .object({
    instanceId: z.string().uuid(),
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().positive()
  })
  .strict()
export type ProjectPipelineNextRound = z.output<typeof projectPipelineNextRoundSchema>
export const projectPipelineCancelSchema = z
  .object({
    instanceId: z.string().uuid(),
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().positive()
  })
  .strict()
export type ProjectPipelineCancel = z.output<typeof projectPipelineCancelSchema>
export const projectPipelineRetrySchema = z
  .object({
    instanceId: z.string().uuid(),
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    operationId: z.string().uuid(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    generation: z.number().int().positive()
  })
  .strict()
export type ProjectPipelineRetry = z.output<typeof projectPipelineRetrySchema>
export interface ProjectPipelineStartReceipt {
  instanceId: string
  runId: string
  roundId: string
  revision: number
}
