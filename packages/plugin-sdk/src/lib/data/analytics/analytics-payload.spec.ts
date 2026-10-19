import { validateAnalyticsPayload } from './analytics-payload'
import type { JSONValue } from '@xpert-ai/contracts'
const schema: JSONValue = {
  type: 'object',
  properties: {
    contractHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    limit: { type: 'integer', default: 10 }
  },
  required: ['contractHash'],
  additionalProperties: false
}
describe('provider payload structural feedback', () => {
  it('rejects truncated opaque values before query without echoing source values', () => {
    expect(() => validateAnalyticsPayload({ contractHash: 'secret-value' }, schema)).toThrow('/contractHash (pattern)')
    try {
      validateAnalyticsPayload({ contractHash: 'secret-value' }, schema)
    } catch (error) {
      expect(error instanceof Error && error.message).not.toContain('secret-value')
    }
  })
  it('does not coerce input, add defaults or strip unknown properties', () => {
    const payload = { contractHash: 'a'.repeat(64) }
    validateAnalyticsPayload(payload, schema)
    expect(payload).toEqual({ contractHash: 'a'.repeat(64) })
    expect(() => validateAnalyticsPayload({ ...payload, limit: '10' }, schema)).toThrow('(type)')
    expect(() => validateAnalyticsPayload({ ...payload, url: 'secret' }, schema)).toThrow('(additionalProperties)')
  })
  it('supports boolean schemas and refuses malformed or unresolved contracts', () => {
    validateAnalyticsPayload({}, true)
    expect(() => validateAnalyticsPayload({}, false)).toThrow('PAYLOAD_INVALID')
    expect(() => validateAnalyticsPayload({}, [])).toThrow('SCHEMA_INVALID')
    expect(() => validateAnalyticsPayload({}, { $ref: 'https://example.invalid/schema' })).toThrow('SCHEMA_INVALID')
  })
  it('rejects async validators before invoking them or treating a Promise as success', () => {
    const asyncSchema: JSONValue = { $async: true, type: 'string' }
    expect(() => validateAnalyticsPayload('valid', asyncSchema)).toThrow('synchronous schema')
    expect(() => validateAnalyticsPayload(42, asyncSchema)).toThrow('synchronous schema')
  })
})
