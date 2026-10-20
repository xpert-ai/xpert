import { MCP_CONFIGURATION_SECRET_MASK, type JSONValue, type JsonSchemaObjectType } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod'

// The platform accepts both localized UI schemas and zod-to-json-schema nodes.
// Only structural fields needed to traverse secrets are read here.
interface ConfigurationSchema {
    type?: string | string[]
    properties?: Record<string, ConfigurationSchema>
    items?: ConfigurationSchema | ConfigurationSchema[]
    'x-ui'?: { component?: string }
}

const traversalSchema: z.ZodType<ConfigurationSchema> = z.lazy(() =>
    z.object({
        type: z.union([z.string(), z.array(z.string())]).optional(),
        properties: z.record(traversalSchema).optional(),
        items: z.union([traversalSchema, z.array(traversalSchema)]).optional(),
        'x-ui': z.object({ component: z.string().optional() }).optional()
    })
)

export function maskConfiguration(schema: JsonSchemaObjectType, values: Record<string, JSONValue>) {
    return transformObject(traversalSchema.parse(schema), values, [], (_schema, value, path) => {
        if (value === null || value === '') return value
        return insideArray(path) ? secretReference(path) : MCP_CONFIGURATION_SECRET_MASK
    })
}

export function restoreConfigurationSecrets(
    schema: JsonSchemaObjectType,
    values: Record<string, JSONValue>,
    current: Record<string, JSONValue>
) {
    const parsed = traversalSchema.parse(schema)
    const references = new Map<string, { schema: ConfigurationSchema; value: JSONValue }>()
    transformObject(parsed, current, [], (field, value, path) => {
        references.set(secretReference(path), { schema: field, value })
        return value
    })
    return transformObject(parsed, values, [], (field, value, path) => {
        if (typeof value !== 'string') return value
        if (value !== MCP_CONFIGURATION_SECRET_MASK && !value.startsWith(`${MCP_CONFIGURATION_SECRET_MASK}:`)) {
            return value
        }
        // Bare masks cannot identify an array item after removal, insertion or reordering.
        const key = value === MCP_CONFIGURATION_SECRET_MASK && !insideArray(path) ? secretReference(path) : value
        const reference = references.get(key)
        // A reference can move within its declared array field, never into another secret field.
        if (!reference || reference.schema !== field) {
            throw new BadRequestException(t('server-ai:Error.McpSourceConfigurationInvalid'))
        }
        return reference.value
    })
}

type ConfigurationPath = readonly (string | number)[]
type TransformSecret = (schema: ConfigurationSchema, value: JSONValue, path: ConfigurationPath) => JSONValue

function insideArray(path: ConfigurationPath) {
    return path.some((part) => typeof part === 'number')
}

function secretReference(path: ConfigurationPath) {
    // Encodes only the original form location, never the credential. The service checks the saved revision.
    return `${MCP_CONFIGURATION_SECRET_MASK}:${Buffer.from(JSON.stringify(path)).toString('base64url')}`
}

function transformObject(
    schema: ConfigurationSchema,
    values: Record<string, JSONValue>,
    path: ConfigurationPath,
    transformSecret: TransformSecret
): Record<string, JSONValue> {
    return Object.fromEntries(
        Object.entries(schema.properties ?? {}).flatMap(([key, property]) => {
            const value = values[key]
            if (value === undefined) return []
            const transformed = transformValue(property, value, [...path, key], transformSecret)
            return transformed === undefined ? [] : [[key, transformed]]
        })
    )
}

function transformValue(
    schema: ConfigurationSchema,
    value: JSONValue,
    path: ConfigurationPath,
    transformSecret: TransformSecret
): JSONValue | undefined {
    const secret = ['secretInput', 'password'].includes(schema['x-ui']?.component ?? '')
    if (secret) {
        return transformSecret(schema, value, path)
    }
    if (
        'type' in schema &&
        schema.type === 'object' &&
        'properties' in schema &&
        schema.properties &&
        isObject(value)
    ) {
        return transformObject(schema, value, path, transformSecret)
    }
    if (
        'type' in schema &&
        schema.type === 'array' &&
        'items' in schema &&
        Array.isArray(value) &&
        schema.items &&
        !Array.isArray(schema.items)
    ) {
        const items = schema.items
        return value.map((item, index) => transformValue(items, item, [...path, index], transformSecret) ?? null)
    }
    return value
}

function isObject(value: JSONValue | undefined): value is Record<string, JSONValue> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
