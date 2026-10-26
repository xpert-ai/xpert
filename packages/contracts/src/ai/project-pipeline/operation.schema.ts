import { z } from 'zod/v3'
import { projectPipelineJsonSchema, projectPipelineKeySchema } from './primitives.schema'
import { projectPipelineEvidenceRefSchema, projectPipelineSubjectVersionSchema } from './runtime.schema'
import { agentInvocationStatusSchema } from '../agent-runtime.model'
import { executionControlEvidenceSchema } from '../execution-control-evidence.schema'

export const projectPipelineOperationInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('evidence'), value: projectPipelineEvidenceRefSchema }).strict(),
  z
    .object({ kind: z.literal('evidence_collection'), value: z.array(projectPipelineEvidenceRefSchema).max(100) })
    .strict(),
  z
    .object({ kind: z.literal('subjects'), value: z.array(projectPipelineSubjectVersionSchema).min(1).max(100) })
    .strict(),
  z.object({ kind: z.literal('parameter'), value: projectPipelineJsonSchema }).strict()
])

export const projectPipelineAssistantInputSchema = z
  .object({
    prompt: z.string().min(1).max(100_000),
    context: z.record(projectPipelineKeySchema, projectPipelineJsonSchema).optional(),
    humanInput: z.record(projectPipelineKeySchema, projectPipelineJsonSchema).optional()
  })
  .strict()
export type ProjectPipelineAssistantInput = z.output<typeof projectPipelineAssistantInputSchema>
export const projectPipelineRuntimeInputSchema = z
  .object({
    prompt: z.string().min(1).max(100_000),
    context: z.record(projectPipelineKeySchema, projectPipelineJsonSchema).optional(),
    parameters: z.record(projectPipelineKeySchema, projectPipelineJsonSchema).optional()
  })
  .strict()
export type ProjectPipelineRuntimeInput = z.output<typeof projectPipelineRuntimeInputSchema>
export const projectPipelineAssistantExecutionSchema = z
  .object({
    kind: z.literal('assistant_task'),
    executionId: z.string().uuid(),
    conversationId: z.string().uuid(),
    xpertId: z.string().uuid(),
    publishedVersion: z.string().min(1).max(500),
    status: z.enum(['queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'unknown'])
  })
  .strict()
export const projectPipelineRuntimeExecutionSchema = z
  .object({
    kind: z.literal('runtime_invocation'),
    invocationId: z.string().uuid(),
    bindingId: z.string().uuid(),
    provider: z.string().min(1).max(200),
    revision: z.string().min(1).max(500),
    status: agentInvocationStatusSchema
  })
  .strict()
const receipt = {
  control: executionControlEvidenceSchema.optional(),
  receiptKey: z.string().min(1).max(500),
  execution: z
    .discriminatedUnion('kind', [projectPipelineAssistantExecutionSchema, projectPipelineRuntimeExecutionSchema])
    .optional()
}
export const projectPipelineOperationReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...receipt, status: z.literal('pending') }).strict(),
  z
    .object({
      ...receipt,
      status: z.literal('succeeded'),
      outputs: z
        .record(projectPipelineKeySchema, projectPipelineEvidenceRefSchema)
        .refine((value) => Object.keys(value).length <= 100, 'Too many output ports')
    })
    .strict(),
  z.object({ ...receipt, status: z.literal('failed'), code: projectPipelineKeySchema }).strict(),
  z.object({ ...receipt, status: z.literal('cancelled') }).strict(),
  z
    .object({
      control: receipt.control,
      receiptKey: receipt.receiptKey.optional(),
      execution: receipt.execution,
      status: z.literal('unknown')
    })
    .strict()
])
export const projectPipelineCompletionReceiptSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('accepted'), evidence: z.array(projectPipelineEvidenceRefSchema).max(100) }).strict(),
  z.object({ status: z.literal('pending'), code: projectPipelineKeySchema }).strict(),
  z.object({ status: z.literal('rejected'), code: projectPipelineKeySchema }).strict()
])
export const projectPipelinePolicyReceiptSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('decided'),
      outcome: projectPipelineKeySchema,
      evidence: z.array(projectPipelineEvidenceRefSchema).max(100)
    })
    .strict(),
  z.object({ status: z.literal('blocked'), code: projectPipelineKeySchema }).strict()
])
export type ProjectPipelineOperationInput = z.output<typeof projectPipelineOperationInputSchema>
export type ProjectPipelineOperationReceipt = z.output<typeof projectPipelineOperationReceiptSchema>
export type ProjectPipelineCompletionReceipt = z.output<typeof projectPipelineCompletionReceiptSchema>
export type ProjectPipelinePolicyReceipt = z.output<typeof projectPipelinePolicyReceiptSchema>
