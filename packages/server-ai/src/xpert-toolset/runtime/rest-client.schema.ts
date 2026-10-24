import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { isEnableTool, type IXpertToolset, type JSONValue } from '@xpert-ai/contracts'
import type { RestClientScope, RestOperationDescriptor } from '@xpert-ai/plugin-sdk'

export const json: z.ZodType<JSONValue> = z.lazy(() =>
    z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(json)])
)
const jsonObject = z.record(json)
const name = z
    .string()
    .min(1)
    .max(160)
    .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value))
export const scopeSchema = z
    .object({
        actor: z
            .object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() })
            .strict(),
        workspaceId: z.string().uuid(),
        toolsetId: z.string().uuid(),
        deadlineAt: z.number().finite()
    })
    .strict() as z.ZodType<Omit<RestClientScope, 'signal'>>
export const requestSchema = z
    .object({
        operationId: name,
        contractHash: z.string().regex(/^[a-f0-9]{64}$/),
        arguments: jsonObject
    })
    .strict()
const parameter = z.object({
    name,
    in: z.enum(['query', 'path']),
    required: z.boolean().default(false),
    schema: jsonObject,
    style: z.enum(['form', 'simple']).optional(),
    explode: z.boolean().optional()
})
const bundleSchema = z.object({
    server_url: z.string().min(1).max(4000),
    method: z.string(),
    openapi: z.object({
        parameters: z.array(parameter).max(80).default([]),
        'x-xpert-read-only': z.boolean().optional(),
        requestBody: z
            .object({ required: z.boolean().default(false), content: z.record(z.object({ schema: jsonObject })) })
            .nullish()
    })
})
export type RestOperation = {
    descriptor: RestOperationDescriptor
    url: string
    parameters: z.output<typeof parameter>[]
}

export function boundedJson(value: unknown, maxBytes: number) {
    if (Buffer.byteLength(JSON.stringify(value) ?? '') > maxBytes) throw new Error('REST_CLIENT_SIZE_LIMIT')
}
function canonical(value: JSONValue): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value !== null && typeof value === 'object')
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(',')}}`
    return JSON.stringify(value)
}

/** Persisted API definitions are a trust boundary; unsupported serialization fails closed. */
export function operationCatalog(connection: IXpertToolset): RestOperation[] {
    const options = z.object({ baseUrl: z.string().optional() }).parse(connection.options ?? {})
    if ((connection.tools?.length ?? 0) > 1000) throw new Error('REST_CLIENT_SIZE_LIMIT')
    const operations = (connection.tools ?? []).flatMap((tool) => {
        if (!isEnableTool(tool, connection)) return []
        const parsed = bundleSchema.safeParse(tool.options?.api_bundle)
        if (!parsed.success) return []
        const bundle = parsed.data,
            api = bundle.openapi
        const method = bundle.method.toUpperCase()
        if (api['x-xpert-read-only'] === false) return []
        if (method !== 'GET' && !(method === 'POST' && api['x-xpert-read-only'] === true)) return []
        if (method === 'GET' && api.requestBody) return []
        if (
            api.requestBody &&
            (Object.keys(api.requestBody.content).length !== 1 || !api.requestBody.content['application/json'])
        )
            return []
        if (api.parameters.some((p) => p.style && p.style !== (p.in === 'query' ? 'form' : 'simple'))) return []
        const url = (options.baseUrl?.replace(/\/$/, '') ?? '') + bundle.server_url
        try {
            approvedUrl(url.replace(/\{[^{}]+\}/g, 'xpert-path'))
        } catch {
            return []
        }
        // Placeholders belong to path segments only, never host, query or fragment.
        const prefix = url.split('://')[1]?.split('/')[0]
        if (!prefix || /[{}]/.test(prefix) || /[{}]/.test(url.split('?')[1] ?? '')) return []
        const placeholders = [...url.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
        const pathNames = api.parameters.filter((p) => p.in === 'path').map((p) => p.name)
        if (placeholders.some((p) => !pathNames.includes(p)) || pathNames.some((p) => !placeholders.includes(p)))
            return []
        const properties: Record<string, JSONValue> = {},
            required: string[] = []
        for (const location of ['query', 'path'] as const) {
            const fields = api.parameters.filter((p) => p.in === location)
            if (new Set(fields.map((p) => p.name)).size !== fields.length) return []
            const requiredFields = fields.filter((p) => location === 'path' || p.required).map((p) => p.name)
            properties[location] = {
                type: 'object',
                properties: Object.fromEntries(fields.map((p) => [p.name, p.schema])),
                required: requiredFields,
                additionalProperties: false
            }
            if (requiredFields.length) required.push(location)
        }
        if (api.requestBody) {
            properties.body = api.requestBody.content['application/json'].schema
            if (api.requestBody.required) required.push('body')
        }
        const inputSchema = { type: 'object', properties, required, additionalProperties: false }
        const contract = { url, method, inputSchema, parameters: api.parameters, readOnly: true }
        boundedJson(contract, 64000)
        const descriptor: RestOperationDescriptor = {
            operationId: tool.name,
            description: tool.description ?? undefined,
            method,
            inputSchema,
            contractHash: createHash('sha256')
                .update(canonical(json.parse(contract)))
                .digest('hex')
        }
        return [{ descriptor, url, parameters: api.parameters }]
    })
    if (new Set(operations.map((op) => op.descriptor.operationId)).size !== operations.length)
        throw new Error('REST_CLIENT_AMBIGUOUS_OPERATIONS')
    return operations
}

export function validateArguments(operation: RestOperation, arguments_: Record<string, JSONValue>) {
    // Use an isolated Ajv registry; stored schemas cannot pollute another connection's $id cache.
    const engine = addFormats(new Ajv({ strict: false, allErrors: false, coerceTypes: false, useDefaults: false }))
    if (!engine.validate(operation.descriptor.inputSchema, arguments_)) throw new Error('REST_CLIENT_ARGUMENTS_INVALID')
}

export function approvedUrl(value: string) {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
        throw new Error('REST_CLIENT_ENDPOINT_INVALID')
    return url
}

const argumentGroups = z
    .object({ query: jsonObject.default({}), path: jsonObject.default({}), body: json.optional() })
    .strict()
export function serializeRequest(operation: RestOperation, input: Record<string, JSONValue>) {
    const args = argumentGroups.parse(input)
    let target = operation.url
    for (const p of operation.parameters.filter((p) => p.in === 'path')) {
        const value = args.path[p.name]
        if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error('REST_CLIENT_ARGUMENTS_INVALID')
        const segment = String(value)
        if (!segment || /[%\\/?#\u0000-\u001f]/.test(segment) || segment === '.' || segment === '..')
            throw new Error('REST_CLIENT_ARGUMENTS_INVALID')
        target = target.split(`{${p.name}}`).join(encodeURIComponent(segment))
    }
    const url = approvedUrl(target)
    const scalar = (value: JSONValue) => {
        if (value === null || typeof value === 'object') throw new Error('REST_CLIENT_ARGUMENTS_INVALID')
        return String(value)
    }
    for (const p of operation.parameters.filter((p) => p.in === 'query')) {
        if (!Object.prototype.hasOwnProperty.call(args.query, p.name)) continue
        const value = args.query[p.name]
        url.searchParams.delete(p.name)
        if (Array.isArray(value) && p.explode !== false)
            value.forEach((item) => url.searchParams.append(p.name, scalar(item)))
        else url.searchParams.set(p.name, Array.isArray(value) ? value.map(scalar).join(',') : scalar(value))
    }
    return { url: url.href, method: operation.descriptor.method, body: args.body }
}
