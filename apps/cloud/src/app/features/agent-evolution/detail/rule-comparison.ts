import type { EvolutionBaselineInspection } from '@xpert-ai/contracts'

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

function jsonValue(value: unknown): value is JsonValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(jsonValue)
  return typeof value === 'object' && Object.values(value).every(jsonValue)
}

function readDocument(raw?: string | null) {
  if (raw == null) return { raw: null, fields: null }
  try {
    const value: unknown = JSON.parse(raw)
    if (jsonValue(value))
      return {
        raw: JSON.stringify(value, null, 2),
        fields: value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
      }
  } catch {
    /* Preserve provider text verbatim when a structured comparison is unavailable. */
  }
  return { raw, fields: null }
}

export function compareRules(inspection: EvolutionBaselineInspection) {
  const active = readDocument(inspection.current?.contentJson)
  const source = readDocument(inspection.preview.contentJson)
  // A provider's diagnostic payload is never a rule, even if it is valid JSON.
  const a = active.fields,
    b = inspection.preview.ready ? source.fields : null
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])]
    .filter((key) => key !== 'kind' && key !== 'schemaVersion')
    .sort((l, r) => Number(l === 'algorithmVersion') - Number(r === 'algorithmVersion'))
  return {
    active: active.raw,
    source: source.raw,
    rows: keys.map((key) => ({
      key,
      active: a && Object.prototype.hasOwnProperty.call(a, key) ? a[key] : undefined,
      source: b && Object.prototype.hasOwnProperty.call(b, key) ? b[key] : undefined
    }))
  }
}

export function describeRule(
  value: JsonValue | undefined,
  key: string,
  localize: (key: string, fallback?: string, n?: number) => string
): string {
  if (value === undefined) return localize('NotRecorded')
  if (Array.isArray(value)) return localize('Units.' + key, localize('Items', undefined, value.length), value.length)
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return localize(value ? 'Yes' : 'No')
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)) return localize('Values.' + value, value)
  return String(value)
}

export function inspectionFailure(err: unknown): 'denied' | 'unsupported' | 'failed' {
  if (err && typeof err === 'object' && 'status' in err) {
    if (err.status === 403 || err.status === 401) return 'denied'
    if (
      err.status === 400 &&
      'error' in err &&
      err.error &&
      typeof err.error === 'object' &&
      'code' in err.error &&
      err.error.code === 'evolution_baseline_unsupported'
    )
      return 'unsupported'
  }
  return 'failed'
}
