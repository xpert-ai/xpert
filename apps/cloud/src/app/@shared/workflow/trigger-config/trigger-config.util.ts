import { JsonSchemaObjectType } from '../../../@core'

type JsonSchemaLike = JsonSchemaObjectType | Record<string, any> | null | undefined

export function buildJsonSchemaDefaults(schema: JsonSchemaLike): Record<string, unknown> | undefined {
  const value = getJsonSchemaDefaultValue(schema)
  return isRecord(value) ? value : undefined
}

export function hasJsonSchemaRequiredErrors(schema: JsonSchemaLike, value: unknown): boolean {
  if (!schema) {
    return false
  }

  if (schema.type === 'object') {
    const record = isRecord(value) ? value : {}

    for (const name of schema.required ?? []) {
      if (isMissingRequiredValue(record[name])) {
        return true
      }
    }

    return Object.entries(schema.properties ?? {}).some(([name, propertySchema]) => {
      const propertyValue = record[name]
      if (propertyValue == null) {
        return false
      }

      return hasJsonSchemaRequiredErrors(propertySchema as JsonSchemaLike, propertyValue)
    })
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    return value.some((item) => hasJsonSchemaRequiredErrors((schema as any).items, item))
  }

  return false
}

export function jsonSchemaHasConfigFields(schema: JsonSchemaLike): boolean {
  return !!Object.keys((schema as JsonSchemaObjectType | undefined)?.properties ?? {}).length
}

function getJsonSchemaDefaultValue(schema: JsonSchemaLike): unknown {
  if (!schema) {
    return undefined
  }

  if ('defaultValue' in schema && schema.defaultValue !== undefined) {
    return schema.defaultValue
  }

  if ('default' in schema && schema.default !== undefined) {
    return schema.default
  }

  if (schema.type === 'object') {
    const defaults = Object.entries(schema.properties ?? {}).reduce<Record<string, unknown>>((state, [name, value]) => {
      const itemDefault = getJsonSchemaDefaultValue(value as JsonSchemaLike)
      if (itemDefault !== undefined) {
        state[name] = itemDefault
      }
      return state
    }, {})

    return Object.keys(defaults).length ? defaults : undefined
  }

  if (schema.type === 'array' && Array.isArray((schema as any).default)) {
    return [...(schema as any).default]
  }

  return undefined
}

function isMissingRequiredValue(value: unknown) {
  return value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && !value.length)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
