import type { SupportedAnalyticsBinding, AnalyticsField, AnalyticalDataset, AnalyticsValue } from '@xpert-ai/contracts'
import type { AnalyticsProviderResult } from './analytics-provider'

export function resolveAnalyticsParameters(
  binding: SupportedAnalyticsBinding,
  controls: Record<string, AnalyticsValue>
) {
  const allowed = new Set(binding.parameters.map((parameter) => parameter.controlId))
  if (Object.keys(controls).some((name) => !allowed.has(name))) throw new Error('ANALYTICS_UNKNOWN_CONTROL')
  const result: Record<string, AnalyticsValue> = {}
  for (const parameter of binding.parameters) {
    const value = Object.prototype.hasOwnProperty.call(controls, parameter.controlId)
      ? controls[parameter.controlId]
      : parameter.defaultValue
    if (value === undefined || value === null) {
      if (parameter.required) throw new Error('ANALYTICS_PARAMETER_REQUIRED')
      result[parameter.name] = null
      continue
    }
    const valid =
      parameter.type === 'date'
        ? typeof value === 'string' && validDate(value)
        : typeof value === parameter.type && (typeof value !== 'number' || Number.isFinite(value))
    if (!valid || (parameter.allowedValues && !parameter.allowedValues.includes(value)))
      throw new Error('ANALYTICS_PARAMETER_INVALID')
    result[parameter.name] = value
  }
  return result
}

export function normalizeAnalyticsResult(
  binding: SupportedAnalyticsBinding,
  result: AnalyticsProviderResult,
  executionId: string,
  maxRows: number
): AnalyticalDataset {
  if (result.rows.length > maxRows) throw new Error('ANALYTICS_ROW_LIMIT')
  const fields = binding.output.fields
  const keys = fields.map((field) => {
    const matches = result.columns.filter((column) =>
      field.semanticRef ? column.semanticRef === field.semanticRef : column.key === field.sourceField
    )
    if (matches.length !== 1) throw new Error('ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS')
    return matches[0].key
  })
  const rows = result.rows.map((row) =>
    Object.fromEntries(
      fields.map((field, index) => {
        const cell = row[keys[index]]
        if (cell === undefined || !validCell(field, cell)) throw new Error('ANALYTICS_FIELD_TYPE_MISMATCH')
        return [field.id, cell]
      })
    )
  )
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > 2_000_000)
    throw new Error('ANALYTICS_RESULT_TOO_LARGE')
  if (result.completeness.returnedRows !== rows.length) throw new Error('ANALYTICS_ROW_COUNT_MISMATCH')
  if (
    result.completeness.totalRows !== undefined &&
    (!Number.isSafeInteger(result.completeness.totalRows) || result.completeness.totalRows < rows.length)
  )
    throw new Error('ANALYTICS_TOTAL_COUNT_INVALID')
  if (result.completeness.truncated && result.completeness.scope === 'full_query_result')
    throw new Error('ANALYTICS_COMPLETENESS_INVALID')
  if (!Number.isFinite(Date.parse(result.sourceFetchedAt))) throw new Error('ANALYTICS_FRESHNESS_INVALID')
  if (
    binding.output.grain.length &&
    new Set(rows.map((row) => JSON.stringify(binding.output.grain.map((key) => row[key])))).size !== rows.length
  )
    throw new Error('ANALYTICS_GRAIN_MISMATCH')
  return {
    schema: 'xpert.analytics.dataset/v1',
    datasetId: binding.output.datasetId,
    fields,
    rows,
    grain: binding.output.grain,
    completeness: result.completeness,
    freshness: {
      executedAt: new Date().toISOString(),
      sourceFetchedAt: result.sourceFetchedAt,
      dataAsOf: result.dataAsOf
    },
    provenance: {
      executionId,
      bindingId: binding.id,
      providerId: binding.providerId,
      sourceVersion: result.sourceVersion,
      upstreamExecutionId: result.upstreamExecutionId,
      auditRef: result.auditRef
    }
  }
}

function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
function validCell(field: AnalyticsField, cell: AnalyticsValue): boolean {
  if (cell === null) return field.nullable
  switch (field.logicalType) {
    case 'string':
      return typeof cell === 'string'
    case 'boolean':
      return typeof cell === 'boolean'
    case 'float64':
      return typeof cell === 'number' && Number.isFinite(cell)
    case 'int64':
      return (
        typeof cell === 'string' &&
        /^-?\d{1,19}$/.test(cell) &&
        BigInt(cell) >= -(2n ** 63n) &&
        BigInt(cell) < 2n ** 63n
      )
    case 'decimal':
      return typeof cell === 'string' && /^-?\d+(\.\d+)?$/.test(cell)
    case 'date':
      return typeof cell === 'string' && validDate(cell)
    case 'timestamp':
      return (
        typeof cell === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(cell) &&
        validDate(cell.slice(0, 10)) &&
        Number.isFinite(Date.parse(cell))
      )
  }
}
