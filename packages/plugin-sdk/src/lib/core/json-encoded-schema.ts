import { z } from 'zod/v3'

/** Options for accepting JSON text alongside a schema's native input. */
export interface JsonEncodedSchemaOptions {
  /** Maximum string length eligible for decoding, in UTF-16 code units; defaults to 200,000.
   * Native objects and arrays must be bounded by the supplied schema.
   */
  maxChars?: number
}

/**
 * Decode JSON text at most once, then validate with the supplied schema.
 * Intended for schemas whose native input excludes strings, such as objects and arrays.
 * Failed or oversized text remains unchanged so the schema rejects it; nested strings are not decoded.
 * Callers explicitly opt in at an input boundary; domain schemas remain unchanged.
 */
export function jsonEncodedSchema<T extends z.ZodTypeAny>(
  schema: T,
  { maxChars = 200_000 }: JsonEncodedSchemaOptions = {}
) {
  return z.preprocess((value) => {
    if (typeof value !== 'string' || value.length > maxChars) return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }, schema)
}
