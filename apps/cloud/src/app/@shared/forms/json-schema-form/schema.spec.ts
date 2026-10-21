import { jsonObject, toJsonSchemaFormSchema } from './schema'

it('inlines local references, including escaped segments, without mutating provider metadata', () => {
  const root = {
    type: 'object',
    properties: { values: { type: 'array', items: { $ref: '#/$defs/a~1b~0c' } } },
    $defs: { 'a/b~c': { type: 'object', properties: { amount: { type: 'number', default: 0 } } } }
  }
  const before = JSON.stringify(root)
  expect(toJsonSchemaFormSchema(root)?.properties['values']).toEqual({
    type: 'array',
    items: { type: 'object', properties: { amount: { type: 'number', default: 0 } } }
  })
  expect(JSON.stringify(root)).toBe(before)
})

it('bounds recursive and unresolved references with the shared JSON field', () => {
  const schema = toJsonSchemaFormSchema({
    type: 'object',
    properties: {
      loop: { $ref: '#/properties/loop' },
      missing: { $ref: '#/missing' }
    }
  })
  expect(schema?.properties['loop']).toEqual({ 'x-ui': { component: 'json' } })
  expect(schema?.properties['missing']).toEqual({ 'x-ui': { component: 'json' } })
})

it('preserves defaults, constant discriminators and object branches for the shared renderer', () => {
  const schema = toJsonSchemaFormSchema({
    type: 'object',
    properties: {
      reader: {
        default: { format: 'csv' },
        oneOf: [
          { type: 'object', properties: { format: { type: 'string', const: 'csv' } } },
          { type: 'object', properties: { format: { type: 'string', const: 'json' } } }
        ]
      }
    }
  })
  expect(schema?.properties['reader']).toMatchObject({
    default: { format: 'csv' },
    anyOf: [{ properties: { format: { const: 'csv' } } }, { properties: { format: { const: 'json' } } }]
  })
})

it('rejects non-object roots and non-JSON form values while preserving false and zero', () => {
  expect(toJsonSchemaFormSchema({ type: 'array' })).toBeNull()
  expect(jsonObject({ enabled: false, count: 0, nested: [null, {}] })).toBe(true)
  expect(jsonObject({ count: Number.NaN })).toBe(false)
  expect(jsonObject({ missing: undefined })).toBe(false)
})

it('resolves references through union array indices, as emitted for reused pagination parameters', () => {
  const schema = toJsonSchemaFormSchema({
    type: 'object',
    properties: {
      pagination: {
        anyOf: [
          {
            type: 'object',
            properties: {
              offset: { type: 'object', properties: { name: { type: 'string' } } },
              limit: { $ref: '#/properties/pagination/anyOf/0/properties/offset' }
            }
          }
        ]
      }
    }
  })
  expect(schema?.properties['pagination']).toMatchObject({
    anyOf: [
      {
        properties: {
          limit: { type: 'object', properties: { name: { type: 'string' } } }
        }
      }
    ]
  })
})
