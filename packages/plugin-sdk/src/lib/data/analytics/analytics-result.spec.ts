import type { AnalyticsBinding } from '@xpert-ai/contracts'
import { analyticsBindingSchema } from './analytics.schema'
import { normalizeAnalyticsResult, resolveAnalyticsParameters } from './analytics-result'
import type { AnalyticsProviderResult } from './analytics-provider'

const binding: AnalyticsBinding = {
  schemaVersion: 1,
  id: 'revenue',
  dataSourceId: 'b1234567-1234-4234-8234-123456789012',
  providerId: 'test',
  operation: 'read',
  contractVersion: 1,
  payload: {},
  parameters: [{ name: 'start', controlId: 'from', type: 'date', required: true }],
  output: {
    datasetId: 'revenue',
    grain: ['region'],
    fields: [
      {
        id: 'region',
        sourceField: 'region_code',
        label: 'Region',
        logicalType: 'string',
        nullable: false,
        role: 'dimension'
      },
      {
        id: 'amount',
        sourceField: 'net',
        label: 'Revenue',
        logicalType: 'decimal',
        nullable: false,
        role: 'measure',
        unit: 'CNY'
      }
    ]
  }
}
function result(): AnalyticsProviderResult {
  return {
    columns: [{ key: 'region_code' }, { key: 'net' }],
    rows: [{ region_code: 'east', net: '9007199254740993.12' }],
    completeness: { returnedRows: 1, totalAccuracy: 'unknown', scope: 'full_query_result', truncated: false },
    sourceFetchedAt: '2026-10-15T00:00:00Z'
  }
}
describe('analytics dataset boundary', () => {
  it('keeps exact decimals and maps stable field IDs', () => {
    expect(normalizeAnalyticsResult(binding, result(), 'run', 100).rows).toEqual([
      { region: 'east', amount: '9007199254740993.12' }
    ])
  })
  it('retains schema on empty results', () => {
    const empty = result()
    empty.rows = []
    empty.completeness.returnedRows = 0
    expect(normalizeAnalyticsResult(binding, empty, 'run', 100).fields).toHaveLength(2)
  })
  it('rejects a successful response with missing columns or invalid cell types', () => {
    const missing = result()
    missing.columns.pop()
    expect(() => normalizeAnalyticsResult(binding, missing, 'run', 100)).toThrow('FIELD_MISSING')
    const invalid = result()
    invalid.rows[0].net = 42
    expect(() => normalizeAnalyticsResult(binding, invalid, 'run', 100)).toThrow('TYPE_MISMATCH')
  })
  it('enforces limits without silently taking a partial sample', () => {
    expect(() => normalizeAnalyticsResult(binding, result(), 'run', 0)).toThrow('ROW_LIMIT')
  })
  it('checks precise semantic selectors instead of guessing by label', () => {
    const semantic = structuredClone(binding)
    semantic.output.fields[1].semanticRef = 'metric.net'
    expect(() => normalizeAnalyticsResult(semantic, result(), 'run', 100)).toThrow('FIELD_MISSING')
    const mapped = result()
    mapped.columns[1].semanticRef = 'metric.net'
    expect(normalizeAnalyticsResult(semantic, mapped, 'run', 100).rows[0].amount).toBe('9007199254740993.12')
  })
  it('rejects unknown controls, impossible dates and absent required values', () => {
    expect(resolveAnalyticsParameters(binding, { from: '2026-10-15' })).toEqual({ start: '2026-10-15' })
    expect(() => resolveAnalyticsParameters(binding, { from: '2026-02-31' })).toThrow('INVALID')
    expect(() => resolveAnalyticsParameters(binding, {})).toThrow('REQUIRED')
    expect(() => resolveAnalyticsParameters(binding, { from: '2026-10-15', actorId: 'other' })).toThrow(
      'UNKNOWN_CONTROL'
    )
  })
  it('rejects duplicate fields and undeclared grain', () => {
    const invalid = structuredClone(binding)
    invalid.output.grain = ['missing']
    expect(analyticsBindingSchema.safeParse(invalid).success).toBe(false)
    invalid.output.grain = []
    invalid.output.fields.push(invalid.output.fields[0])
    expect(analyticsBindingSchema.safeParse(invalid).success).toBe(false)
  })
  it('rejects duplicate grain and contradictory completeness metadata', () => {
    const duplicated = result()
    duplicated.rows.push(duplicated.rows[0])
    duplicated.completeness.returnedRows = 2
    expect(() => normalizeAnalyticsResult(binding, duplicated, 'run', 100)).toThrow('GRAIN_MISMATCH')
    const contradictory = result()
    contradictory.completeness.truncated = true
    expect(() => normalizeAnalyticsResult(binding, contradictory, 'run', 100)).toThrow('COMPLETENESS_INVALID')
  })
  it('does not treat inherited properties as supplied controls', () => {
    const special: AnalyticsBinding = {
      ...binding,
      parameters: [{ name: 'name', controlId: 'constructor', type: 'string', required: true, defaultValue: 'safe' }]
    }
    expect(resolveAnalyticsParameters(special, {})).toEqual({ name: 'safe' })
  })
})
