import type { JSONValue, McpJsonSchema, McpPrincipal, McpToolCapabilityDescriptor } from '@xpert-ai/contracts'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { environment } from '@xpert-ai/server-config'
import type { ToolInputApi, ToolInputRequest } from '@xpert-ai/plugin-sdk'
import {
    createRequestStateCodec,
    type ElicitRequestFormParams,
    inputRequired,
    type InputRequiredResult,
    type JsonSchemaType,
    type RequestStateCodec,
    type ServerContext
} from '@modelcontextprotocol/server'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { createHash, randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { McpPublication, McpPublicationCapability } from './entities'

const ELICITATION_KEY_PREFIX = 'xpert:mcp:elicitation:'
const ELICITATION_TTL_MS = 10 * 60 * 1000
const ELICITATION_MAX_SCHEMA_BYTES = 32 * 1024
const SENSITIVE_FIELD_PATTERN = /(api.?key|access.?token|refresh.?token|password|passwd|secret|credential)/i

interface McpElicitationState {
    version: 1
    stateId: string
    publicationId: string
    capabilityId: string
    subjectId: string
    executionId: string
    argumentsHash: string
    requestHash: string
    inputKey: string
    expiresAt: number
}

interface PersistedMcpElicitationState extends McpElicitationState {
    request: ToolInputRequest
}

export interface McpElicitationExecution {
    executionId: string
    input: ToolInputApi
}

export type McpInputResponseResolution =
    | { kind: 'missing' }
    | { kind: 'accepted'; content: JSONValue }
    | { kind: 'declined' }
    | { kind: 'cancelled' }

export class McpInputRequiredError extends Error {
    constructor(readonly result: InputRequiredResult) {
        super('MCP tool input is required')
    }
}

@Injectable()
export class McpElicitationService {
    readonly #validator = new AjvJsonSchemaValidator()

    constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

    createCodec(publication: McpPublication, principal: McpPrincipal): RequestStateCodec<McpElicitationState> {
        return createRequestStateCodec<McpElicitationState>({
            key: requestStateSecret(),
            ttlSeconds: ELICITATION_TTL_MS / 1000,
            bind: (context) =>
                `${context.mcpReq.method}\0${publication.id}\0${principal.subjectType}\0${principal.subjectId}`
        })
    }

    normalizeRequest(request: ToolInputRequest): ToolInputRequest {
        return normalizeInputRequest(request)
    }

    embeddedRequest(request: ToolInputRequest) {
        return toInputRequest(request)
    }

    resolveResponse(request: ToolInputRequest, response: unknown): McpInputResponseResolution {
        const parsed = parseInputResponseValue(response)
        if (parsed.kind !== 'accepted') return parsed
        if (request.type === 'url') {
            if (
                parsed.content !== undefined &&
                (typeof parsed.content !== 'object' ||
                    parsed.content === null ||
                    Array.isArray(parsed.content) ||
                    Object.keys(parsed.content).length > 0)
            ) {
                throw invalidRequest()
            }
            return { kind: 'accepted', content: {} }
        }
        return {
            kind: 'accepted',
            content: validateInputResponse<JSONValue>(request, parsed.content, this.#validator)
        }
    }

    async prepare(input: {
        publication: McpPublication
        principal: McpPrincipal
        capability: McpPublicationCapability
        descriptor: McpToolCapabilityDescriptor
        arguments: unknown
        context: ServerContext
        codec: RequestStateCodec<McpElicitationState>
    }): Promise<McpElicitationExecution> {
        const verifiedState = parseElicitationState(input.context.mcpReq.requestState())
        const argumentsHash = hashJson(input.arguments)
        if (verifiedState) {
            this.assertBinding(verifiedState, input, argumentsHash)
        }
        const executionId = verifiedState?.executionId ?? randomUUID()
        return {
            executionId,
            input: {
                request: <TValue extends JSONValue = JSONValue>(request: ToolInputRequest) =>
                    this.requestInput<TValue>({
                        ...input,
                        request,
                        executionId,
                        argumentsHash,
                        verifiedState
                    })
            }
        }
    }

    private async requestInput<TValue extends JSONValue>(input: {
        publication: McpPublication
        principal: McpPrincipal
        capability: McpPublicationCapability
        descriptor: McpToolCapabilityDescriptor
        arguments: unknown
        context: ServerContext
        codec: RequestStateCodec<McpElicitationState>
        request: ToolInputRequest
        executionId: string
        argumentsHash: string
        verifiedState: McpElicitationState | null
    }): Promise<TValue> {
        const normalizedRequest = normalizeInputRequest(input.request)
        const requestHash = hashJson(normalizedRequest)
        let persisted: PersistedMcpElicitationState | null = null
        if (input.verifiedState) {
            persisted = await this.read(input.verifiedState.stateId)
            if (!persisted || persisted.requestHash !== requestHash) throw invalidState()
            const response = this.resolveResponse(
                normalizedRequest,
                input.context.mcpReq.inputResponses
                    ? Reflect.get(input.context.mcpReq.inputResponses, persisted.inputKey)
                    : undefined
            )
            if (response.kind === 'accepted') {
                await this.redis.del(stateKey(persisted.stateId))
                return response.content as TValue
            }
            if (response.kind === 'declined' || response.kind === 'cancelled') {
                await this.redis.del(stateKey(persisted.stateId))
                throw new BadRequestException(
                    t('server-ai:Error.McpElicitationDeclined', {
                        defaultValue: 'The client declined or cancelled the requested input.'
                    })
                )
            }
        }

        const state: PersistedMcpElicitationState = persisted ?? {
            version: 1,
            stateId: randomUUID(),
            publicationId: input.publication.id,
            capabilityId: input.capability.id,
            subjectId: input.principal.subjectId,
            executionId: input.executionId,
            argumentsHash: input.argumentsHash,
            requestHash,
            inputKey: 'input',
            expiresAt: Date.now() + ELICITATION_TTL_MS,
            request: normalizedRequest
        }
        const ttl = Math.max(1, state.expiresAt - Date.now())
        await this.redis.set(stateKey(state.stateId), JSON.stringify(state), { PX: ttl })
        const requestState = await input.codec.mint(toSignedState(state), input.context)
        throw new McpInputRequiredError(
            inputRequired({
                inputRequests: { [state.inputKey]: toInputRequest(normalizedRequest) },
                requestState
            })
        )
    }

    private assertBinding(
        state: McpElicitationState,
        input: {
            publication: McpPublication
            principal: McpPrincipal
            capability: McpPublicationCapability
        },
        argumentsHash: string
    ) {
        if (
            state.expiresAt <= Date.now() ||
            state.publicationId !== input.publication.id ||
            state.capabilityId !== input.capability.id ||
            state.subjectId !== input.principal.subjectId ||
            state.argumentsHash !== argumentsHash
        ) {
            throw invalidState()
        }
    }

    private async read(stateId: string): Promise<PersistedMcpElicitationState | null> {
        const raw = await this.redis.get(stateKey(stateId))
        return raw ? parsePersistedState(JSON.parse(raw)) : null
    }
}

function toInputRequest(request: ToolInputRequest) {
    return request.type === 'form'
        ? inputRequired.elicit({
              message: request.title,
              requestedSchema: parseElicitationFormSchema(request.schema)
          })
        : inputRequired.elicitUrl({ message: request.title ?? 'Continue authorization', url: request.url })
}

function normalizeInputRequest(request: ToolInputRequest): ToolInputRequest {
    if (request.type === 'url') {
        const url = normalizeInputUrl(request.url)
        return { type: 'url', url: url.toString(), title: normalizeTitle(request.title) }
    }
    return {
        type: 'form',
        title: normalizeTitle(request.title) ?? 'Additional input required',
        schema: normalizeFormSchema(request.schema)
    }
}

function normalizeTitle(value?: string) {
    const title = value?.trim()
    if (!title) return undefined
    if (title.length > 200) throw invalidRequest()
    return title
}

function normalizeInputUrl(value: string) {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw invalidRequest()
    }
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password) {
        throw invalidRequest()
    }
    return url
}

function normalizeFormSchema(schema: McpJsonSchema): McpJsonSchema {
    const normalized =
        schema.type === 'object' ? schema : { type: 'object', properties: schema, additionalProperties: false }
    parseJsonSchema(normalized)
    if (containsSensitiveField(normalized)) {
        throw new BadRequestException(
            t('server-ai:Error.McpElicitationSensitiveField', {
                defaultValue: 'Form elicitation must not request passwords, secrets, API keys, or OAuth tokens.'
            })
        )
    }
    return normalized
}

function parseJsonSchema(schema: McpJsonSchema): JsonSchemaType {
    if (Buffer.byteLength(JSON.stringify(schema), 'utf8') > ELICITATION_MAX_SCHEMA_BYTES) throw invalidRequest()
    if (schema.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null) {
        throw invalidRequest()
    }
    return schema as JsonSchemaType
}

function parseElicitationFormSchema(schema: McpJsonSchema): ElicitRequestFormParams['requestedSchema'] {
    parseJsonSchema(schema)
    const properties = schema.properties
    if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
        throw invalidRequest()
    }
    for (const key of Object.keys(properties)) {
        const property = Reflect.get(properties, key)
        if (!isSupportedElicitationProperty(property)) throw invalidRequest()
    }
    const required = schema.required
    if (required !== undefined && (!Array.isArray(required) || required.some((key) => typeof key !== 'string'))) {
        throw invalidRequest()
    }
    return schema as ElicitRequestFormParams['requestedSchema']
}

function isSupportedElicitationProperty(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const type = Reflect.get(value, 'type')
    if (type === 'string' || type === 'boolean' || type === 'number' || type === 'integer') return true
    if (type !== 'array') return false
    const items = Reflect.get(value, 'items')
    if (typeof items !== 'object' || items === null || Array.isArray(items)) return false
    return Reflect.get(items, 'type') === 'string' || Array.isArray(Reflect.get(items, 'anyOf'))
}

function containsSensitiveField(value: unknown, path = ''): boolean {
    if (Array.isArray(value)) return value.some((item, index) => containsSensitiveField(item, `${path}.${index}`))
    if (typeof value !== 'object' || value === null) return false
    for (const key of Object.keys(value)) {
        const nextPath = path ? `${path}.${key}` : key
        const child = Reflect.get(value, key)
        if ((key === 'format' && child === 'password') || SENSITIVE_FIELD_PATTERN.test(nextPath)) return true
        if (containsSensitiveField(child, nextPath)) return true
    }
    return false
}

function validateInputResponse<TValue extends JSONValue>(
    request: ToolInputRequest,
    value: unknown,
    validator: AjvJsonSchemaValidator
): TValue {
    if (request.type !== 'form') throw invalidState()
    const validate = validator.getValidator<TValue>(parseJsonSchema(request.schema))
    const result = validate(value)
    if (!result.valid) throw invalidRequest()
    return result.data
}

function parseInputResponseValue(
    response: unknown
): McpInputResponseResolution | { kind: 'accepted'; content: unknown } {
    if (typeof response !== 'object' || response === null || Array.isArray(response))
        return { kind: 'missing' } as const
    const action = Reflect.get(response, 'action')
    if (action === 'accept') return { kind: 'accepted', content: Reflect.get(response, 'content') } as const
    if (action === 'decline') return { kind: 'declined' } as const
    if (action === 'cancel') return { kind: 'cancelled' } as const
    return { kind: 'missing' } as const
}

function parseElicitationState(value: unknown): McpElicitationState | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const state: McpElicitationState = {
        version: Reflect.get(value, 'version'),
        stateId: Reflect.get(value, 'stateId'),
        publicationId: Reflect.get(value, 'publicationId'),
        capabilityId: Reflect.get(value, 'capabilityId'),
        subjectId: Reflect.get(value, 'subjectId'),
        executionId: Reflect.get(value, 'executionId'),
        argumentsHash: Reflect.get(value, 'argumentsHash'),
        requestHash: Reflect.get(value, 'requestHash'),
        inputKey: Reflect.get(value, 'inputKey'),
        expiresAt: Reflect.get(value, 'expiresAt')
    }
    return state.version === 1 &&
        [
            state.stateId,
            state.publicationId,
            state.capabilityId,
            state.subjectId,
            state.executionId,
            state.argumentsHash,
            state.requestHash,
            state.inputKey
        ].every((item) => typeof item === 'string' && item.length > 0) &&
        typeof state.expiresAt === 'number'
        ? state
        : null
}

function parsePersistedState(value: unknown): PersistedMcpElicitationState | null {
    const state = parseElicitationState(value)
    if (!state || typeof value !== 'object' || value === null) return null
    const request = parseInputRequest(Reflect.get(value, 'request'))
    return request ? { ...state, request } : null
}

function parseInputRequest(value: unknown): ToolInputRequest | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const type = Reflect.get(value, 'type')
    const title = Reflect.get(value, 'title')
    if (type === 'url') {
        const url = Reflect.get(value, 'url')
        return typeof url === 'string' && (title === undefined || typeof title === 'string')
            ? { type, url, ...(typeof title === 'string' ? { title } : {}) }
            : null
    }
    const schema = Reflect.get(value, 'schema')
    return type === 'form' && typeof title === 'string' && isJsonObject(schema) ? { type, title, schema } : null
}

function isJsonObject(value: unknown): value is McpJsonSchema {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toSignedState(state: PersistedMcpElicitationState): McpElicitationState {
    const signed = { ...state }
    Reflect.deleteProperty(signed, 'request')
    return signed
}

function stateKey(stateId: string) {
    return `${ELICITATION_KEY_PREFIX}${stateId}`
}

function hashJson(value: unknown) {
    return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    if (typeof value === 'object' && value !== null) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`)
            .join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
}

function requestStateSecret() {
    const secret =
        process.env.XPERT_MCP_REQUEST_STATE_SECRET?.trim() ||
        environment.secretsEncryptionKey?.trim() ||
        process.env.JWT_SECRET?.trim()
    if (secret && Buffer.byteLength(secret, 'utf8') >= 32) return secret
    if (!environment.production) return 'xpert-mcp-request-state-development-key'
    throw new Error('XPERT_MCP_REQUEST_STATE_SECRET must contain at least 32 bytes in production')
}

function invalidState() {
    return new BadRequestException(
        t('server-ai:Error.McpElicitationInvalidState', {
            defaultValue: 'MCP elicitation state is invalid, expired, or does not match this request.'
        })
    )
}

function invalidRequest() {
    return new BadRequestException(
        t('server-ai:Error.McpElicitationInvalidRequest', {
            defaultValue: 'MCP elicitation request or response is invalid.'
        })
    )
}
