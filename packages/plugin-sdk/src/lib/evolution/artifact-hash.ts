import { createHash } from 'crypto'

/** JSON data eligible for a reproducible evolution digest. Array order is significant; object key order is not. */
export type EvolutionJson = null | boolean | number | string | EvolutionJson[] | { [key: string]: EvolutionJson }

/** Returns the sha256-prefixed hex digest of the canonical JSON value. */
export function hashEvolutionValue(value: EvolutionJson) {
  return `sha256:${createHash('sha256').update(canonicalEvolutionJson(value)).digest('hex')}`
}

/** Serializes JSON with object keys in sorted order and array elements in their original order. */
export function canonicalEvolutionJson(value: EvolutionJson): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalEvolutionJson(item)).join(',')}]`
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalEvolutionJson(value[key])}`)
    .join(',')}}`
}
