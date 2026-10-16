import { z } from 'zod/v3'
import { jsonEncodedSchema } from './json-encoded-schema'

describe('jsonEncodedSchema', () => {
  const schema = jsonEncodedSchema(z.object({ ids: z.array(z.string()).max(2) }).strict(), { maxChars: 100 })

  it('accepts native or once-encoded objects with the same domain type', () => {
    const value = { ids: ['first'] }
    expect(schema.parse(value)).toEqual(value)
    expect(schema.parse(JSON.stringify(value))).toEqual(value)
  })

  it.each([
    ['malformed JSON', 'invalid'],
    ['null', 'null'],
    ['wrong container type', '[]'],
    ['wrong field type', '{"ids":[1]}'],
    ['unknown field', '{"ids":[],"actor":"other"}'],
    ['double encoding', JSON.stringify(JSON.stringify({ ids: [] }))],
    ['too many items', JSON.stringify({ ids: ['a', 'b', 'c'] })],
    ['oversized text', JSON.stringify({ ids: ['x'.repeat(101)] })]
  ])('rejects %s without relaxing the supplied schema', (_label, value) => {
    expect(schema.safeParse(value).success).toBe(false)
  })

  it('preserves array defaults, refinements and transforms', () => {
    const values = jsonEncodedSchema(
      z
        .array(z.number().int())
        .max(2)
        .default([])
        .refine((items) => items.every((item) => item > 0))
        .transform((items) => items.length)
    )
    expect(values.parse(undefined)).toBe(0)
    expect(values.parse([1, 2])).toBe(2)
    expect(values.parse('[1,2]')).toBe(2)
    expect(values.safeParse('[-1]').success).toBe(false)
    expect(values.safeParse('[1,2,3]').success).toBe(false)
  })

  it('applies the configured limit before decoding, including whitespace', () => {
    const value = '{"ids":[]}'.padEnd(100)
    expect(schema.parse(value)).toEqual({ ids: [] })
    expect(schema.safeParse(value + ' ').success).toBe(false)
  })

  it('preserves the default decoding limit of 200,000 code units', () => {
    const empty = jsonEncodedSchema(z.object({}).strict())
    expect(empty.parse('{}'.padEnd(200_000))).toEqual({})
    expect(empty.safeParse('{}'.padEnd(200_001)).success).toBe(false)
  })

  it('does not decode strings inside the accepted object', () => {
    const nested = jsonEncodedSchema(z.object({ text: z.string() }).strict())
    const value = { text: '{"nested":true}' }
    expect(nested.parse(value)).toEqual(value)
    expect(nested.parse(JSON.stringify(value))).toEqual(value)
  })
})
