import type { AnalyticsField, AnalyticsValue } from '@xpert-ai/contracts'

/** Shared wire-value rules for normalized query results and immutable evidence snapshots. */
export function isAnalyticsDate(value: string) {
  // Date.parse normalizes some impossible dates; round-trip validation rejects that rollover.
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
/** int64/decimal stay strings on the wire to avoid JavaScript number rounding; never coerce them. */
export function isAnalyticsCell(type: AnalyticsField['logicalType'], cell: AnalyticsValue, nullable: boolean): boolean {
  if (cell === null) return nullable
  switch (type) {
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
      return typeof cell === 'string' && isAnalyticsDate(cell)
    case 'timestamp':
      return (
        typeof cell === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(cell) &&
        isAnalyticsDate(cell.slice(0, 10)) &&
        Number.isFinite(Date.parse(cell))
      )
  }
}
