// Why this exists: modern MCP HTTP servers can route calls before reading the body.
// Project only schema-annotated arguments, preserving their values with SEP-2243 encoding;
// inferring headers from argument names would change the server's routing contract.
type HeaderParameter = {
    name: string
    path: string[]
    type: 'string' | 'integer' | 'boolean'
}

const schemaValues = new Set([
    'items',
    'additionalItems',
    'contains',
    'additionalProperties',
    'unevaluatedProperties',
    'unevaluatedItems',
    'propertyNames',
    'not',
    'if',
    'then',
    'else'
])
const schemaArrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const schemaMaps = new Set(['$defs', 'definitions', 'patternProperties', 'dependentSchemas', 'dependencies'])

/** SEP-2243: only annotations reached through properties can be projected. */
export function toolHeaderParameters(inputSchema: object): HeaderParameter[] {
    const parameters: HeaderParameter[] = []
    const names = new Set<string>()
    const visit = (schema: unknown, path: string[], reachable: boolean) => {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
        const annotation = Reflect.get(schema, 'x-mcp-header')
        if (annotation !== undefined) {
            if (!reachable || !path.length) throw new Error('x-mcp-header must be on a statically reachable property')
            if (typeof annotation !== 'string' || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(annotation))
                throw new Error('x-mcp-header must be a non-empty HTTP field-name token')
            const name = annotation.toLowerCase()
            if (names.has(name)) throw new Error('x-mcp-header names must be unique ignoring case')
            const declared = Reflect.get(schema, 'type')
            const types = Array.isArray(declared) ? declared.filter((type) => type !== 'null') : [declared]
            const type = types[0]
            if (types.length !== 1 || (type !== 'string' && type !== 'integer' && type !== 'boolean'))
                throw new Error('x-mcp-header requires a string, integer or boolean type')
            names.add(name)
            parameters.push({ name: annotation, path, type })
        }
        for (const [key, value] of Object.entries(schema)) {
            if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
                for (const [property, child] of Object.entries(value)) visit(child, [...path, property], reachable)
            } else if (schemaValues.has(key)) {
                if (Array.isArray(value)) value.forEach((child) => visit(child, path, false))
                else visit(value, path, false)
            } else if (schemaArrays.has(key) && Array.isArray(value)) {
                value.forEach((child) => visit(child, path, false))
            } else if (schemaMaps.has(key) && value && typeof value === 'object') {
                Object.values(value).forEach((child) => visit(child, path, false))
            }
        }
    }
    visit(inputSchema, [], true)
    return parameters
}

export function encodeMcpHeaderValue(value: string): string {
    // HTTP headers normalize surrounding whitespace and cannot carry arbitrary UTF-8.
    // Encode sentinel-shaped literals too, so decoding cannot change their meaning.
    if (
        /^[\t\x20-\x7e]*$/.test(value) &&
        value.trim() === value &&
        !(value.startsWith('=?base64?') && value.endsWith('?='))
    )
        return value
    return `=?base64?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export function projectToolParameterHeaders(parameters: HeaderParameter[], arguments_: object): Record<string, string> {
    const headers = new Map<string, string>()
    for (const parameter of parameters) {
        let value: unknown = arguments_
        for (const property of parameter.path) {
            value =
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                Object.prototype.hasOwnProperty.call(value, property)
                    ? Reflect.get(value, property)
                    : undefined
        }
        if (value === undefined || value === null) continue
        if (
            (parameter.type === 'string' && typeof value !== 'string') ||
            (parameter.type === 'boolean' && typeof value !== 'boolean') ||
            (parameter.type === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value)))
        )
            throw new Error(`Invalid ${parameter.type} value for MCP header parameter '${parameter.name}'`)
        headers.set(parameter.name, encodeMcpHeaderValue(String(value)))
    }
    return Object.fromEntries(headers)
}
