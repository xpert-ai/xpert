/**
 * Parses query-style boolean values. Query parsers can provide booleans,
 * strings, numbers, or repeated values as arrays.
 */
export function parseQueryBoolean(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => parseQueryBoolean(item))
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}
