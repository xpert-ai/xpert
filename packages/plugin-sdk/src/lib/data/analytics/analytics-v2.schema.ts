import { z } from 'zod/v3'
import type {
  AnalyticsBindingV2,
  AnalyticsSourceRef,
  SupportedAnalyticsBinding,
  AnalyticsQueryRequestV2,
  AnalyticsDiscoveryRequestV2
} from '@xpert-ai/contracts'
import {
  analyticsBindingObjectSchema,
  analyticsBindingSchema,
  analyticsControlsSchema,
  analyticsDiscoveryRequestObjectSchema,
  validateAnalyticsBinding
} from './analytics.schema'

export const analyticsSourceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('data-source'), dataSourceId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('definition'), definitionId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('artifact'), artifactId: z.string().uuid(), versionId: z.string().uuid() }).strict()
]) as z.ZodType<AnalyticsSourceRef>
export const analyticsBindingV2ObjectSchema = analyticsBindingObjectSchema
  .omit({ dataSourceId: true })
  .extend({
    schemaVersion: z.literal(2),
    source: analyticsSourceRefSchema
  })
  .strict()
export const analyticsBindingV2Schema = analyticsBindingV2ObjectSchema.superRefine(
  validateAnalyticsBinding
) as z.ZodType<AnalyticsBindingV2>
/** Deliberately additive: do not broaden analyticsBindingSchema or relax legacy consumers. */
export const supportedAnalyticsBindingSchema = z.union([
  analyticsBindingSchema,
  analyticsBindingV2Schema
]) as z.ZodType<SupportedAnalyticsBinding>
export const analyticsQueryRequestV2Schema = z
  .object({
    binding: supportedAnalyticsBindingSchema,
    controls: analyticsControlsSchema
  })
  .strict() as z.ZodType<AnalyticsQueryRequestV2, z.ZodTypeDef, unknown>
export const analyticsDiscoveryRequestV2Schema = analyticsDiscoveryRequestObjectSchema
  .omit({ dataSourceId: true })
  .extend({
    source: analyticsSourceRefSchema
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16000,
    'Discovery request exceeds limit'
  ) as z.ZodType<AnalyticsDiscoveryRequestV2, z.ZodTypeDef, unknown>
