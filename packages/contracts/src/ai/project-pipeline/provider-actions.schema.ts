import { z } from 'zod/v3'
import { projectPipelineJsonSchema, projectPipelineKeySchema, projectPipelineRefSchema } from './primitives.schema'
import { projectPipelineParameterFieldSchema, parseProjectPipelineParameters } from './configuration-form'

const label = z.object({ en_US: z.string().min(1).max(200), zh_Hans: z.string().min(1).max(200).optional() }).strict()
export const projectPipelineProviderActionDescriptorSchema = z
  .object({
    ref: projectPipelineRefSchema,
    label,
    description: label.optional(),
    sourceRevision: z.string().min(1).max(500),
    effects: z.enum(['read_only', 'domain_write', 'external_write']),
    idempotency: z.literal('keyed_receipt'),
    parameters: z.array(projectPipelineParameterFieldSchema).max(30),
    defaults: z.record(projectPipelineKeySchema, projectPipelineJsonSchema)
  })
  .strict()
  .superRefine((action, context) => {
    try {
      parseProjectPipelineParameters(action.parameters, action.defaults)
    } catch {
      context.addIssue({ code: 'custom', message: 'INVALID_ACTION_PARAMETERS', path: ['parameters'] })
    }
  })
export const projectPipelineProviderActionTargetSchema = z
  .object({
    instanceId: z.string().uuid(),
    nodeInstanceId: z.string().uuid(),
    roundId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    generation: z.number().int().positive(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()
export const projectPipelineProviderActionCommandSchema = projectPipelineProviderActionTargetSchema
  .extend({
    requestId: z.string().uuid(),
    actionRef: projectPipelineRefSchema,
    sourceRevision: z.string().min(1).max(500),
    parameters: z.record(projectPipelineKeySchema, projectPipelineJsonSchema)
  })
  .strict()
export const projectPipelineProviderActionReceiptSchema = z
  .object({
    status: z.enum(['pending', 'unknown', 'succeeded', 'failed']),
    receiptKey: z.string().min(1).max(500).optional(),
    reasonCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,99}$/)
      .optional()
  })
  .strict()
export const projectPipelineProviderActionViewSchema = z
  .object({
    id: z.string().uuid(),
    nodeInstanceId: z.string().uuid(),
    actionRef: projectPipelineRefSchema,
    state: z.enum(['queued', 'dispatching', 'pending', 'unknown', 'succeeded', 'failed', 'superseded']),
    reasonCode: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    projectionPending: z.boolean()
  })
  .strict()
export const projectPipelineProviderActionsSchema = z
  .object({
    dispatchEnabled: z.boolean().optional(),
    target: projectPipelineProviderActionTargetSchema,
    items: z.array(projectPipelineProviderActionDescriptorSchema).max(100),
    operations: z.array(projectPipelineProviderActionViewSchema).max(50)
  })
  .strict()
export type ProjectPipelineProviderActionDescriptor = z.output<typeof projectPipelineProviderActionDescriptorSchema>
export type ProjectPipelineProviderActionTarget = z.output<typeof projectPipelineProviderActionTargetSchema>
export type ProjectPipelineProviderActionCommand = z.output<typeof projectPipelineProviderActionCommandSchema>
export type ProjectPipelineProviderActionReceipt = z.output<typeof projectPipelineProviderActionReceiptSchema>
export type ProjectPipelineProviderActionView = z.output<typeof projectPipelineProviderActionViewSchema>
export type ProjectPipelineProviderActions = z.output<typeof projectPipelineProviderActionsSchema>
