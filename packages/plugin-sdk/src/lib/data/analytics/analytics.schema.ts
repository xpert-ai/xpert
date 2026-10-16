import { z } from 'zod/v3'
import type {
  AnalyticsBinding,
  AnalyticsQueryRequest,
  AnalyticsDiscoveryRequest,
  AnalyticsDiscoveryResult,
  JSONValue
} from '@xpert-ai/contracts'

const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/)
const value = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
const json: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([z.string().max(32000), z.number().finite(), z.boolean(), z.null(), z.array(json).max(1000), z.record(json)])
)
export const analyticsOptionsSchema = z.record(json)
export const analyticsFieldSchema = z
  .object({
    id: key,
    sourceField: z.string().min(1).max(256),
    label: z.string().min(1).max(160),
    logicalType: z.enum(['string', 'boolean', 'int64', 'float64', 'decimal', 'date', 'timestamp']),
    nullable: z.boolean(),
    role: z.enum(['dimension', 'measure', 'time', 'identifier']),
    semanticRef: z.string().max(512).optional(),
    unit: z.string().max(80).optional()
  })
  .strict()
export const analyticsParameterSchema = z
  .object({
    name: key,
    controlId: key,
    type: z.enum(['string', 'number', 'boolean', 'date']),
    required: z.boolean(),
    defaultValue: value.optional(),
    allowedValues: z.array(value).max(200).optional()
  })
  .strict()
export const analyticsBindingObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: key,
    dataSourceId: z.string().uuid(),
    providerId: z.string().min(1).max(160),
    operation: key,
    contractVersion: z.number().int().positive(),
    payload: json,
    parameters: z.array(analyticsParameterSchema).max(24),
    output: z
      .object({
        datasetId: key,
        fields: z.array(analyticsFieldSchema).min(1).max(80),
        grain: z.array(key).max(20)
      })
      .strict()
  })
  .strict()
export const analyticsBindingSchema = analyticsBindingObjectSchema.superRefine((binding, ctx) => {
  const fields = binding.output.fields.map((field) => field.id)
  const names = binding.parameters.map((parameter) => parameter.name)
  if (new Set(fields).size !== fields.length || new Set(names).size !== names.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate field or parameter identifier' })
  if (
    new Set(binding.output.grain).size !== binding.output.grain.length ||
    binding.output.grain.some((field) => !fields.includes(field))
  )
    ctx.addIssue({ code: 'custom', message: 'Grain references an undeclared field' })
  if (new TextEncoder().encode(JSON.stringify(binding.payload)).byteLength > 64000)
    ctx.addIssue({ code: 'custom', message: 'Query payload exceeds limit' })
}) as z.ZodType<AnalyticsBinding>
export const analyticsQueryRequestSchema = z
  .object({
    binding: analyticsBindingSchema,
    controls: z.record(key, value).default({})
  })
  .strict() as z.ZodType<AnalyticsQueryRequest, z.ZodTypeDef, unknown>

export const analyticsDiscoveryRequestSchema = z
  .object({
    dataSourceId: z.string().uuid(),
    providerId: z.string().min(1).max(160),
    request: json.default({})
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16000,
    'Discovery request exceeds limit'
  ) as z.ZodType<AnalyticsDiscoveryRequest, z.ZodTypeDef, unknown>
export const analyticsDiscoveryResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(512),
            name: z.string().min(1).max(512),
            kind: z.enum(['collection', 'dataset']),
            description: z.string().max(4000).optional(),
            inspectRequest: json.optional(),
            metadata: json
          })
          .strict()
      )
      .max(50),
    nextRequest: json.optional(),
    queryContract: z
      .object({
        operation: key,
        contractVersion: z.number().int().positive(),
        payloadSchema: json,
        instructions: z.string().max(8000)
      })
      .strict()
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 128000,
    'Discovery response exceeds limit'
  ) as z.ZodType<AnalyticsDiscoveryResult>
