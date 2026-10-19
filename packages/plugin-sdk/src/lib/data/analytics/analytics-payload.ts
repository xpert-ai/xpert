import Ajv, { type ValidateFunction } from 'ajv'
import type { JSONValue } from '@xpert-ai/contracts'

/** Structural feedback from the discovered provider contract. Never substitutes for provider authorization or validation. */
export function validateAnalyticsPayload(payload: JSONValue, schema: JSONValue): void {
  if (typeof schema !== 'boolean' && (schema === null || typeof schema !== 'object' || Array.isArray(schema))) {
    throw new Error('ANALYTICS_PAYLOAD_SCHEMA_INVALID: expected a provider JSON Schema')
  }
  // Do not coerce, remove properties, apply defaults, fetch remote refs, or treat unknown formats as authorization.
  const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: false })
  let validate: ValidateFunction
  try {
    validate = ajv.compile(schema)
  } catch {
    throw new Error(
      'ANALYTICS_PAYLOAD_SCHEMA_INVALID: rediscover the provider contract; its schema could not be compiled'
    )
  }
  if ('$async' in validate && validate.$async) {
    throw new Error('ANALYTICS_PAYLOAD_SCHEMA_INVALID: provider payload validation must use a synchronous schema')
  }
  if (!validate(payload)) {
    const issue = validate.errors?.[0]
    const location = issue?.instancePath || '/'
    throw new Error(
      `ANALYTICS_PAYLOAD_INVALID: ${location.slice(0, 240)} (${issue?.keyword ?? 'schema'}). Compare this field with the discovered payloadSchema and canonical Binding. Copy opaque IDs, revisions and contract hashes exactly; do not retry unchanged input.`
    )
  }
}
