import { z } from 'zod/v3'
import type {
  AnalyticsField,
  AnalyticsValue,
  ResourceAnalysisPolicy,
  ResourceAnalysisQuery,
  ResourceAnalysisFilter
} from '@xpert-ai/contracts'

const key = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value))
const scalar = z.union([z.string().max(512), z.number().finite(), z.boolean(), z.null()])
/** Validate one predicate's shape/cardinality; field existence, logical types and allowed scope require live dataset metadata. */
export const resourceAnalysisFilterSchema: z.ZodType<ResourceAnalysisFilter> = z
  .object({
    field: key,
    operator: z.enum(['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte']),
    values: z.array(scalar).min(1).max(50)
  })
  .strict()
  .refine((value) => value.operator === 'in' || value.values.length === 1) as z.ZodType<ResourceAnalysisFilter>
/**
 * Shared authoring/server policy boundary: bounded nonempty allowlists, fixed-filter fields and supported mode combinations.
 * Parsing does not establish source sharing authority or receiving-group consent; those remain runtime checks.
 */
export const resourceAnalysisPolicySchema: z.ZodType<ResourceAnalysisPolicy> = z
  .object({
    mode: z.enum(['bindings', 'explore']),
    datasets: z
      .array(
        z
          .object({ key, fields: z.array(key).min(1).max(64), filters: z.array(resourceAnalysisFilterSchema).max(20) })
          .strict()
      )
      .min(1)
      .max(20),
    allowDetails: z.boolean(),
    maxRows: z.number().int().min(1).max(100)
  })
  .strict()
  .refine((value) => new Set(value.datasets.map((item) => item.key)).size === value.datasets.length)
  .refine((value) =>
    value.datasets.every(
      (item) =>
        new Set(item.fields).size === item.fields.length &&
        item.filters.every((filter) => item.fields.includes(filter.field))
    )
  )
  .refine((value) => value.mode !== 'bindings' || value.allowDetails) as z.ZodType<ResourceAnalysisPolicy>
/**
 * Normalize public query input to ResourceAnalysisQuery, defaulting optional wire collections to empty values.
 * Keep limit absent so the executor uses the live policy's maxRows; validate field/mode/budget permissions before querying.
 */
export const resourceAnalysisQuerySchema: z.ZodType<ResourceAnalysisQuery> = z
  .object({
    datasetKey: key,
    controls: z
      .record(key, scalar)
      .refine((value) => Object.keys(value).length <= 32)
      .default({}),
    select: z.array(key).max(64).default([]),
    filters: z.array(resourceAnalysisFilterSchema).max(20).default([]),
    groupBy: z.array(key).max(8).default([]),
    aggregates: z
      .array(z.object({ field: key.optional(), key, operation: z.enum(['count', 'sum', 'min', 'max']) }).strict())
      .max(16)
      .default([]),
    orderBy: z
      .array(z.object({ field: key, direction: z.enum(['asc', 'desc']) }).strict())
      .max(8)
      .default([]),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict() as z.ZodType<ResourceAnalysisQuery>

/**
 * Check a predicate scalar against the declared logical type, including exact-string int64/decimal wire values.
 * Shared by authoring and execution; this does not validate the operator, field allowlist or grant authority.
 */
export function isResourceAnalysisFilterValue(type: AnalyticsField['logicalType'], value: AnalyticsValue): boolean {
  if (value === null) return true
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'float64') return typeof value === 'number' && Number.isFinite(value)
  if (typeof value !== 'string') return false
  if (type === 'int64') return value.length <= 128 && /^-?\d+$/.test(value)
  if (type === 'decimal') return value.length <= 128 && /^-?\d+(\.\d+)?$/.test(value)
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  if (type === 'timestamp') return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
  return true
}
