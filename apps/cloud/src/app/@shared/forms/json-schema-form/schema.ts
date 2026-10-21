import type { JSONValue, JsonSchemaObjectType } from '@xpert-ai/contracts'

/** JSON schema from provider metadata crosses into the shared form at this boundary. */
export function jsonObject(value: unknown): value is Record<string, JSONValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(jsonValue)
}

function jsonValue(value: unknown): value is JSONValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) ? value.every(jsonValue) : jsonObject(value))
  )
}

/** Inline local references; recursive/unresolved schemas remain editable as JSON. */
export function toJsonSchemaFormSchema(root: Record<string, JSONValue>): JsonSchemaObjectType | null {
  const normalize = (schema: Record<string, JSONValue>, refs: string[]): Record<string, JSONValue> => {
    const ref = schema['$ref']
    if (typeof ref === 'string') {
      let target: JSONValue = root
      if (!ref.startsWith('#/') || refs.includes(ref)) return { 'x-ui': { component: 'json' } }
      for (const segment of ref.slice(2).split('/')) {
        const key = segment.replace(/~1/g, '/').replace(/~0/g, '~')
        if (Array.isArray(target)) {
          if (!/^(0|[1-9]\d*)$/.test(key) || !Object.hasOwn(target, key)) return { 'x-ui': { component: 'json' } }
          target = target[Number(key)]
        } else {
          if (!jsonObject(target) || !Object.hasOwn(target, key)) return { 'x-ui': { component: 'json' } }
          target = target[key]
        }
      }
      if (!jsonObject(target)) return { 'x-ui': { component: 'json' } }
      const { $ref, ...metadata } = schema
      return normalize({ ...target, ...metadata }, [...refs, ref])
    }
    const result = { ...schema }
    if (jsonObject(schema['properties'])) {
      result['properties'] = Object.fromEntries(
        Object.entries(schema['properties']).map(([name, child]) => [
          name,
          jsonObject(child) ? normalize(child, refs) : { 'x-ui': { component: 'json' } }
        ])
      )
    }
    if (jsonObject(schema['items'])) result['items'] = normalize(schema['items'], refs)
    const variants = schema['anyOf'] ?? schema['oneOf']
    if (Array.isArray(variants)) result['anyOf'] = variants.filter(jsonObject).map((child) => normalize(child, refs))
    return result
  }
  const schema = normalize(root, [])
  if (schema['type'] !== 'object' || !jsonObject(schema['properties'])) return null
  // Provider schemas use draft-07; the root and recursive properties have been checked above.
  return { ...schema, type: 'object', properties: schema['properties'] } as JsonSchemaObjectType
}
