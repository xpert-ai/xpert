import type { AnalyticsBinding, AnalyticsBindingV2 } from '@xpert-ai/contracts'
import { analyticsBindingSchema, analyticsQueryRequestSchema } from './analytics.schema'
import {
  analyticsBindingV2Schema,
  supportedAnalyticsBindingSchema,
  analyticsSourceRefSchema,
  analyticsQueryRequestV2Schema,
  analyticsDiscoveryRequestV2Schema
} from './analytics-v2.schema'
import { normalizeAnalyticsResult } from './analytics-result'
import published from './testing/published-dashboard-v1.json'

const v1: AnalyticsBinding = analyticsBindingSchema.parse(published.manifest.bindings[0])
const { dataSourceId, schemaVersion, ...query } = v1
const v2: AnalyticsBindingV2 = { ...query, schemaVersion: 2, source: { kind: 'data-source', dataSourceId } }
describe('additive analytics wire contracts', () => {
  it('retains every legacy envelope and rejects v2 on the old entry points', () => {
    for (const binding of published.manifest.bindings) {
      expect(analyticsBindingSchema.parse(binding)).toEqual(binding)
      expect(supportedAnalyticsBindingSchema.parse(binding)).toEqual(binding)
    }
    expect(analyticsBindingSchema.safeParse(v2).success).toBe(false)
    expect(analyticsQueryRequestSchema.safeParse({ binding: v2 }).success).toBe(false)
    expect(analyticsQueryRequestV2Schema.parse({ binding: v1 })).toEqual({ binding: v1, controls: {} })
  })
  it.each([
    { kind: 'data-source', dataSourceId },
    { kind: 'definition', definitionId: dataSourceId, versionId: dataSourceId },
    { kind: 'artifact', artifactId: dataSourceId, versionId: dataSourceId }
  ])('accepts explicit pinned source $kind without mutating the input', (source) => {
    const input = { ...v2, source }
    const before = JSON.stringify(input)
    expect(analyticsBindingV2Schema.parse(input)).toEqual(input)
    expect(JSON.stringify(input)).toBe(before)
  })
  it.each([
    { kind: 'artifact', artifactId: dataSourceId },
    { kind: 'definition', definitionId: dataSourceId, versionId: 'latest' },
    { kind: 'data-source', dataSourceId, tenantId: dataSourceId },
    { kind: 'artifact', artifactId: dataSourceId, versionId: dataSourceId, dataSourceId },
    { kind: 'files', dataSourceId }
  ])('rejects incomplete, mixed or caller-scoped source references', (source) => {
    expect(analyticsSourceRefSchema.safeParse(source).success).toBe(false)
  })
  it('shares v1 parameter/output constraints and payload bounds', () => {
    expect(analyticsBindingV2Schema.safeParse({ ...v2, dataSourceId }).success).toBe(false)
    expect(
      analyticsBindingV2Schema.safeParse({ ...v2, parameters: [...v2.parameters, ...v2.parameters] }).success
    ).toBe(false)
    expect(analyticsBindingV2Schema.safeParse({ ...v2, output: { ...v2.output, grain: ['missing'] } }).success).toBe(
      false
    )
    expect(analyticsBindingV2Schema.safeParse({ ...v2, payload: ['a'.repeat(32000), 'b'.repeat(32000)] }).success).toBe(
      false
    )
    expect(analyticsQueryRequestV2Schema.safeParse({ binding: v2, controls: { invalid: {} } }).success).toBe(false)
    expect(analyticsQueryRequestV2Schema.safeParse({ binding: v2, actor: {} }).success).toBe(false)
  })
  it('defaults discovery input and rejects scope, unbounded or credential-shaped source fields', () => {
    const input = { source: v2.source, providerId: v2.providerId }
    expect(analyticsDiscoveryRequestV2Schema.parse(input).request).toEqual({})
    expect(analyticsDiscoveryRequestV2Schema.safeParse({ ...input, request: 'a'.repeat(16000) }).success).toBe(false)
    expect(analyticsDiscoveryRequestV2Schema.safeParse({ ...input, options: { password: 'secret' } }).success).toBe(
      false
    )
  })
  it('retains the canonical dataset contract for v2 and exact decimal values', () => {
    const output = normalizeAnalyticsResult(
      v2,
      {
        columns: [{ key: 'amount' }],
        rows: [{ amount: '9007199254740993.12' }],
        completeness: { returnedRows: 1, totalAccuracy: 'unknown', scope: 'full_query_result', truncated: false },
        sourceFetchedAt: '2026-10-20T00:00:00Z'
      },
      'run',
      1000
    )
    expect(output.schema).toBe('xpert.analytics.dataset/v1')
    expect(output.rows[0].amount).toBe('9007199254740993.12')
    expect(output.provenance.bindingId).toBe(v1.id)
  })
})
