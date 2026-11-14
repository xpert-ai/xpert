import { z } from 'zod/v3'
import type { AnalysisEvidenceSnapshot } from '@xpert-ai/contracts'
import { analyticsFieldSchema } from './analytics.schema'
import { analyticsCertificationSchema } from './analytics-certification'
import { isAnalyticsCell } from './analytics-value'

// Evidence is a bounded copy of a past result. Parsing establishes neither current source access
// nor certification authority; producers and readers enforce those checks in their own runtime.
const key = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value))
const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
const dataset = z
  .object({
    schema: z.literal('xpert.analytics.dataset'),
    datasetId: key,
    fields: z.array(analyticsFieldSchema).min(1).max(64),
    rows: z.array(z.record(key, scalar)).max(1000),
    grain: z.array(key).max(64),
    completeness: z
      .object({
        returnedRows: z.number().int().nonnegative(),
        totalRows: z.number().int().nonnegative().optional(),
        totalAccuracy: z.enum(['exact', 'estimated', 'unknown']),
        scope: z.enum(['full_query_result', 'page', 'sample', 'top_n']),
        truncated: z.boolean()
      })
      .strict(),
    freshness: z
      .object({
        executedAt: z.string().datetime(),
        sourceFetchedAt: z.string().datetime(),
        dataAsOf: z.string().max(160).optional()
      })
      .strict(),
    provenance: z
      .object({
        executionId: key,
        bindingId: key,
        providerId: key,
        sourceVersion: z.string().max(512).optional(),
        upstreamExecutionId: key.optional(),
        auditRef: z.string().max(512).optional(),
        certification: analyticsCertificationSchema.optional()
      })
      .strict()
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.fields.map((field) => field.id))
    if (
      ids.size !== value.fields.length ||
      new Set(value.grain).size !== value.grain.length ||
      value.grain.some((id) => !ids.has(id)) ||
      value.completeness.returnedRows !== value.rows.length ||
      (value.completeness.totalRows !== undefined && value.completeness.totalRows < value.rows.length) ||
      (value.completeness.truncated && value.completeness.scope === 'full_query_result')
    )
      ctx.addIssue({ code: 'custom', message: 'Inconsistent evidence result' })
    for (const row of value.rows) {
      // Reuse result validation so transport never coerces values or relaxes their logical types.
      if (
        Object.keys(row).length !== ids.size ||
        Object.keys(row).some((id) => !ids.has(id)) ||
        value.fields.some(
          (field) =>
            !Object.prototype.hasOwnProperty.call(row, field.id) ||
            !isAnalyticsCell(field.logicalType, row[field.id], field.nullable)
        )
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid evidence cells' })
    }
  })
export const analysisEvidenceSchema = z
  .object({
    schema: z.literal('xpert.analysis-evidence@1'),
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    capturedAt: z.string().datetime(),
    source: z
      .object({ artifactId: z.string().uuid(), versionId: z.string().uuid(), projectId: z.string().uuid() })
      .strict(),
    controls: z.record(key, scalar).refine((value) => Object.keys(value).length <= 32),
    datasets: z.array(dataset).min(1).max(20),
    statements: z
      .array(
        z
          .object({
            kind: z.enum(['fact', 'inference', 'unverified']),
            text: z.string().min(1).max(2000),
            citations: z
              .array(z.object({ datasetId: key, row: z.number().int().nonnegative(), field: key }).strict())
              .max(64)
          })
          .strict()
      )
      .max(1000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.datasets.map((item) => item.datasetId)).size !== value.datasets.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate evidence dataset' })
    for (const statement of value.statements) {
      // A citation identifies an existing cell; it does not prove the statement's interpretation.
      if (statement.kind === 'fact' && !statement.citations.length)
        ctx.addIssue({ code: 'custom', message: 'Facts need cell citations' })
      for (const citation of statement.citations) {
        const data = value.datasets.find((item) => item.datasetId === citation.datasetId)
        if (!data || citation.row >= data.rows.length || !data.fields.some((field) => field.id === citation.field))
          ctx.addIssue({ code: 'custom', message: 'Unknown evidence cell' })
      }
    }
    if (new TextEncoder().encode(JSON.stringify(value)).length > 2_000_000)
      ctx.addIssue({ code: 'custom', message: 'Evidence exceeds limit' })
  })

/** Canonicalize validated JSON: sort object keys, but preserve array order and exact scalar values.
 * Omitted optional properties do not affect the digest. Hashing stays in the consumer's runtime. */
export function canonicalEvidenceJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalEvidenceJson).join(',') + ']'
  return (
    '{' +
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, entry]) => JSON.stringify(name) + ':' + canonicalEvidenceJson(entry))
      .join(',') +
    '}'
  )
}
/** Validate shape and cell references; callers must verify the digest and current source access separately. */
export function parseAnalysisEvidence(value: unknown): AnalysisEvidenceSnapshot {
  return analysisEvidenceSchema.parse(value) as AnalysisEvidenceSnapshot
}
/** Exclude only the digest itself; source, capture time, cells and statement classifications stay covered. */
export function analysisEvidenceDigestInput(value: AnalysisEvidenceSnapshot): string {
  const { sha256: _digest, ...body } = value
  return canonicalEvidenceJson(body)
}
