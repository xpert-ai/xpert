import type { DynamicStructuredTool } from '@langchain/core/tools'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import type { Connection } from '@langchain/mcp-adapters'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { MCP_APP_RESOURCE_MIME_TYPE } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { applicationTracing } from '../../tracing/application-tracing'
import {
    MCP_CONSUMER_PROTOCOL_VERSION,
    MCP_CLIENT_CAPABILITIES_META_KEY,
    MCP_CLIENT_INFO_META_KEY,
    MCP_PROTOCOL_VERSION_META_KEY,
    McpConsumerConnection,
    McpConsumerExtensionRequest,
    McpConsumerHttpError,
    McpConsumerNotification,
    McpConsumerProtocolError,
    McpConsumerRoutingHeaders
} from './mcp-consumer-connection'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const MAX_JSON_RESPONSE_BYTES = 4 * 1024 * 1024
const MCP_UI_EXTENSION_ID = 'io.modelcontextprotocol/ui'

type McpHttpProtocol = 'modern' | 'legacy'

const httpProtocolsByAdapter = new WeakMap<MultiServerMCPClient, Map<string, McpHttpProtocol>>()
const httpProtocolNegotiationsByAdapter = new WeakMap<MultiServerMCPClient, Map<string, Promise<McpHttpProtocol>>>()
const modernServerDescriptorsByAdapter = new WeakMap<
    MultiServerMCPClient,
    Map<string, z.infer<typeof serverDiscoverySchema>>
>()

type McpExtensionRequester = {
    request<TSchema extends z.ZodType<object>>(
        request: McpConsumerExtensionRequest,
        resultSchema: TSchema,
        options?: { signal?: AbortSignal }
    ): Promise<z.infer<TSchema>>
}

type JsonRpcEnvelope = {
    jsonrpc: '2.0'
    id: string
    method: string
    params?: object
}

export class LangChainMcpConnection implements McpConsumerConnection {
    constructor(readonly adapter: MultiServerMCPClient) {}

    serverNames(): string[] {
        return Object.keys(adapterConfig(this.adapter).mcpServers ?? {})
    }

    resolveServerName(serverName?: string): string {
        const names = this.serverNames()
        if (serverName) {
            if (!names.includes(serverName)) {
                throw new Error(`MCP server '${serverName}' is not configured`)
            }
            return serverName
        }
        if (names.length !== 1) {
            throw new Error(`MCP capability execution requires a server name; ${names.length} servers are configured`)
        }
        return names[0]
    }

    usesModernHttp(serverName?: string): boolean {
        const resolvedName = this.resolveServerName(serverName)
        return httpProtocolsByAdapter.get(this.adapter)?.get(resolvedName) === 'modern'
    }

    formatToolName(serverName: string, toolName: string): string {
        const resolvedName = this.resolveServerName(serverName)
        const config = adapterConfig(this.adapter)
        const additionalPrefix = config.additionalToolNamePrefix ? `${config.additionalToolNamePrefix}__` : ''
        const serverPrefix = config.prefixToolNameWithServerName ? `${resolvedName}__` : ''
        return `${additionalPrefix}${serverPrefix}${toolName}`
    }

    async negotiateHttpProtocols(): Promise<void> {
        for (const serverName of this.serverNames()) {
            if (isHttpConnection(this.connection(serverName))) {
                await this.negotiateHttpProtocol(serverName)
            }
        }
    }

    async describeServer(serverName?: string) {
        const resolvedName = this.resolveServerName(serverName)
        if (
            isHttpConnection(this.connection(resolvedName)) &&
            (await this.negotiateHttpProtocol(resolvedName)) === 'modern'
        ) {
            const result = modernServerDescriptorsByAdapter.get(this.adapter)?.get(resolvedName)
            if (!result) throw new Error(`MCP server '${resolvedName}' did not return discovery metadata`)
            const meta = result._meta
            const serverInfoValue = meta ? Reflect.get(meta, 'io.modelcontextprotocol/serverInfo') : undefined
            const serverInfo = serverImplementation(serverInfoValue)
            return {
                supportedVersions: result.supportedVersions,
                capabilities: result.capabilities,
                ...(serverInfo ? { serverInfo } : {}),
                ...(result.instructions ? { instructions: result.instructions } : {})
            }
        }
        const client = await this.getClient(resolvedName)
        const serverInfo = client.getServerVersion()
        const instructions = client.getInstructions()
        return {
            supportedVersions: [],
            capabilities: client.getServerCapabilities() ?? {},
            ...(serverInfo ? { serverInfo: { name: serverInfo.name, version: serverInfo.version } } : {}),
            ...(instructions ? { instructions } : {})
        }
    }

    async getClient(serverName?: string): Promise<Client> {
        const resolvedName = this.resolveServerName(serverName)
        const client = await this.adapter.getClient(resolvedName)
        if (!client) {
            throw new Error(`MCP server '${resolvedName}' is not connected`)
        }
        return client
    }

    getLangChainTools(serverNames?: string[]): Promise<DynamicStructuredTool[]> {
        const requestedNames = serverNames?.length ? serverNames : this.serverNames()
        const modernNames = requestedNames.filter((serverName) => this.usesModernHttp(serverName))
        if (modernNames.length) {
            throw new Error(`MCP 2026 HTTP tools must use McpConsumer.tools.asLangChain(): ${modernNames.join(', ')}`)
        }
        return requestedNames.length ? this.adapter.getTools(...requestedNames) : Promise.resolve([])
    }

    async requestExtension<TSchema extends z.ZodType<object>>(
        serverName: string | undefined,
        request: McpConsumerExtensionRequest,
        resultSchema: TSchema,
        options?: {
            routing?: McpConsumerRoutingHeaders
            signal?: AbortSignal
            timeoutMs?: number
        }
    ): Promise<z.infer<TSchema>> {
        const resolvedName = this.resolveServerName(serverName)
        const connection = this.connection(resolvedName)
        if (options?.routing && isHttpConnection(connection)) {
            const requestHandle = await this.fetchHttp(resolvedName, request, options.routing, {
                signal: options.signal,
                timeoutMs: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
            })
            try {
                return parseJsonRpcResult(
                    await readJsonRpcResponse(requestHandle.response, requestHandle.requestId),
                    resultSchema
                )
            } finally {
                requestHandle.dispose()
            }
        }

        const client = await this.getClient(resolvedName)
        const requester = client as unknown as McpExtensionRequester
        return requester.request(request, resultSchema, options?.signal ? { signal: options.signal } : undefined)
    }

    async listenExtension(
        serverName: string | undefined,
        request: McpConsumerExtensionRequest,
        options: {
            routing: McpConsumerRoutingHeaders
            signal: AbortSignal
        }
    ): Promise<AsyncIterable<McpConsumerNotification>> {
        const resolvedName = this.resolveServerName(serverName)
        const connection = this.connection(resolvedName)
        if (!isHttpConnection(connection)) {
            throw new Error(
                'MCP extension subscriptions require Streamable HTTP; SSE is legacy and STDIO is request-scoped'
            )
        }
        const requestHandle = await this.fetchHttp(resolvedName, request, options.routing, {
            signal: options.signal
        })
        const response = requestHandle.response
        if (!response.body) {
            requestHandle.dispose()
            throw new Error('MCP subscription response did not include a body')
        }
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        if (!contentType.includes('text/event-stream')) {
            try {
                const payload = await readJsonResponse(response)
                parseJsonRpcResult(payload, z.object({}).passthrough())
                throw new Error('MCP subscription completed without an event stream')
            } finally {
                requestHandle.dispose()
            }
        }
        return readSseNotifications(response.body, requestHandle.dispose)
    }

    private connection(serverName: string): Connection {
        const connection = adapterConfig(this.adapter).mcpServers?.[serverName]
        if (!connection) {
            throw new Error(`MCP server '${serverName}' is not configured`)
        }
        return connection
    }

    private async negotiateHttpProtocol(serverName: string): Promise<McpHttpProtocol> {
        const knownProtocol = httpProtocolsByAdapter.get(this.adapter)?.get(serverName)
        if (knownProtocol) return knownProtocol

        let negotiations = httpProtocolNegotiationsByAdapter.get(this.adapter)
        if (!negotiations) {
            negotiations = new Map()
            httpProtocolNegotiationsByAdapter.set(this.adapter, negotiations)
        }
        const activeNegotiation = negotiations.get(serverName)
        if (activeNegotiation) return activeNegotiation

        const negotiation = this.probeHttpProtocol(serverName)
        negotiations.set(serverName, negotiation)
        try {
            const protocol = await negotiation
            let protocols = httpProtocolsByAdapter.get(this.adapter)
            if (!protocols) {
                protocols = new Map()
                httpProtocolsByAdapter.set(this.adapter, protocols)
            }
            protocols.set(serverName, protocol)
            return protocol
        } finally {
            negotiations.delete(serverName)
        }
    }

    private async probeHttpProtocol(serverName: string): Promise<McpHttpProtocol> {
        try {
            const result = await this.requestExtension(
                serverName,
                { method: 'server/discover', params: {} },
                serverDiscoverySchema,
                { routing: { method: 'server/discover' } }
            )
            if (!result.supportedVersions.includes(MCP_CONSUMER_PROTOCOL_VERSION)) {
                throw new Error(`MCP server '${serverName}' does not support protocol ${MCP_CONSUMER_PROTOCOL_VERSION}`)
            }
            let descriptors = modernServerDescriptorsByAdapter.get(this.adapter)
            if (!descriptors) {
                descriptors = new Map()
                modernServerDescriptorsByAdapter.set(this.adapter, descriptors)
            }
            descriptors.set(serverName, result)
            return 'modern'
        } catch (error) {
            if (isLegacyDiscoveryResponse(error)) return 'legacy'
            throw error
        }
    }

    private async fetchHttp(
        serverName: string,
        request: McpConsumerExtensionRequest,
        routing: McpConsumerRoutingHeaders,
        options: { signal?: AbortSignal; timeoutMs?: number }
    ) {
        const connection = this.connection(serverName)
        if (!isHttpConnection(connection)) {
            throw new Error(`MCP server '${serverName}' does not use Streamable HTTP`)
        }
        const url = parseHttpUrl(connection.url)
        const headers = new Headers(connection.headers)
        headers.set('Accept', 'application/json, text/event-stream')
        headers.set('Content-Type', 'application/json')
        headers.set('MCP-Protocol-Version', MCP_CONSUMER_PROTOCOL_VERSION)
        headers.set('Mcp-Method', routing.method)
        if (routing.name) headers.set('Mcp-Name', routing.name)
        if (!headers.has('Authorization') && connection.authProvider) {
            const tokens = await connection.authProvider.tokens()
            if (tokens?.access_token) headers.set('Authorization', `Bearer ${tokens.access_token}`)
        }

        const requestId = randomUUID()
        headers.set('X-Request-Id', requestId)
        const envelope: JsonRpcEnvelope = {
            jsonrpc: '2.0',
            id: requestId,
            method: request.method,
            params: modernRequestParams(request.params)
        }
        const abort = linkedAbortController(options.signal, options.timeoutMs)
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(envelope),
                signal: abort.signal
            })
            if (!response.ok) {
                throw new McpConsumerHttpError(
                    response.status,
                    `MCP server '${serverName}' returned HTTP ${response.status}`,
                    response.headers.get('www-authenticate') ?? undefined
                )
            }
            return { response, requestId, dispose: abort.dispose }
        } catch (error) {
            abort.dispose()
            throw error
        }
    }
}

function adapterConfig(adapter: MultiServerMCPClient): MultiServerMCPClient['config'] {
    const runtimeConfig = Reflect.get(adapter, '_config')
    return isAdapterConfig(runtimeConfig) ? runtimeConfig : adapter.config
}

function isAdapterConfig(value: unknown): value is MultiServerMCPClient['config'] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const mcpServers = Reflect.get(value, 'mcpServers')
    return typeof mcpServers === 'object' && mcpServers !== null && !Array.isArray(mcpServers)
}

function modernRequestParams(params?: object) {
    const existingMeta = params ? Reflect.get(params, '_meta') : undefined
    const meta =
        typeof existingMeta === 'object' && existingMeta !== null && !Array.isArray(existingMeta) ? existingMeta : {}
    const clientCapabilities = Reflect.get(meta, MCP_CLIENT_CAPABILITIES_META_KEY)
    const suppliedCapabilities =
        typeof clientCapabilities === 'object' && clientCapabilities !== null && !Array.isArray(clientCapabilities)
            ? clientCapabilities
            : undefined
    const suppliedExtensions = suppliedCapabilities ? Reflect.get(suppliedCapabilities, 'extensions') : undefined
    const traceContext = applicationTracing.injectContext()
    return {
        ...(params ?? {}),
        _meta: {
            ...traceContext,
            ...meta,
            [MCP_PROTOCOL_VERSION_META_KEY]: MCP_CONSUMER_PROTOCOL_VERSION,
            [MCP_CLIENT_INFO_META_KEY]: { name: 'xpert-mcp-consumer', version: '1.0.0' },
            [MCP_CLIENT_CAPABILITIES_META_KEY]: {
                elicitation: { form: {}, url: {} },
                ...(suppliedCapabilities ? Object.fromEntries(Object.entries(suppliedCapabilities)) : {}),
                extensions: {
                    [MCP_UI_EXTENSION_ID]: { mimeTypes: [MCP_APP_RESOURCE_MIME_TYPE] },
                    ...(typeof suppliedExtensions === 'object' &&
                    suppliedExtensions !== null &&
                    !Array.isArray(suppliedExtensions)
                        ? Object.fromEntries(Object.entries(suppliedExtensions))
                        : {})
                }
            }
        }
    }
}

const serverDiscoverySchema = z
    .object({
        supportedVersions: z.array(z.string()),
        capabilities: z.object({}).passthrough(),
        instructions: z.string().optional(),
        _meta: z.object({}).passthrough().optional()
    })
    .passthrough()

function serverImplementation(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const name = Reflect.get(value, 'name')
    const version = Reflect.get(value, 'version')
    return typeof name === 'string' && typeof version === 'string' ? { name, version } : undefined
}

function isLegacyDiscoveryResponse(error: unknown): boolean {
    if (error instanceof McpConsumerProtocolError) {
        return error.code === -32601 || error.code === -32002
    }
    if (error instanceof McpConsumerHttpError) {
        return [400, 404, 405, 406, 415].includes(error.status)
    }
    return false
}

function isHttpConnection(connection: Connection): connection is Extract<Connection, { url: string }> {
    return 'url' in connection && (connection.transport === 'http' || connection.type === 'http')
}

function parseHttpUrl(value: string) {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Unsupported MCP HTTP protocol '${url.protocol}'`)
    }
    return url
}

function linkedAbortController(parent?: AbortSignal, timeoutMs?: number) {
    const controller = new AbortController()
    const onAbort = () => controller.abort(parent?.reason)
    if (parent?.aborted) onAbort()
    else parent?.addEventListener('abort', onAbort, { once: true })
    const timeout = timeoutMs ? setTimeout(() => controller.abort(new Error('MCP request timed out')), timeoutMs) : null
    timeout?.unref?.()
    return {
        signal: controller.signal,
        dispose: () => {
            if (timeout) clearTimeout(timeout)
            parent?.removeEventListener('abort', onAbort)
        }
    }
}

async function readJsonResponse(response: Response): Promise<unknown> {
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_RESPONSE_BYTES) {
        throw new Error('MCP response exceeds the maximum allowed size')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_JSON_RESPONSE_BYTES) {
        throw new Error('MCP response exceeds the maximum allowed size')
    }
    const text = new TextDecoder().decode(bytes)
    try {
        return JSON.parse(text)
    } catch {
        throw new Error('MCP server returned invalid JSON')
    }
}

async function readJsonRpcResponse(response: Response, requestId: string): Promise<unknown> {
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('text/event-stream')) return readJsonResponse(response)
    if (!response.body) throw new Error('MCP event-stream response did not include a body')
    return readSseJsonRpcResponse(response.body, requestId)
}

async function readSseJsonRpcResponse(body: ReadableStream<Uint8Array>, requestId: string): Promise<unknown> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let totalBytes = 0
    let streamEnded = false
    try {
        while (!streamEnded) {
            const chunk = await reader.read()
            if (chunk.done) {
                streamEnded = true
                continue
            }
            const value = chunk.value
            totalBytes += value.byteLength
            if (totalBytes > MAX_JSON_RESPONSE_BYTES) throw new Error('MCP response exceeds the maximum allowed size')
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            let boundary = buffer.indexOf('\n\n')
            while (boundary >= 0) {
                const payload = parseSsePayload(buffer.slice(0, boundary))
                buffer = buffer.slice(boundary + 2)
                if (
                    typeof payload === 'object' &&
                    payload !== null &&
                    !Array.isArray(payload) &&
                    Reflect.get(payload, 'id') === requestId
                ) {
                    await reader.cancel().catch(() => undefined)
                    return payload
                }
                boundary = buffer.indexOf('\n\n')
            }
        }
    } finally {
        reader.releaseLock()
    }
    throw new Error(`MCP event stream ended before response '${requestId}' was received`)
}

function parseSsePayload(event: string): unknown {
    const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
    if (!data) return undefined
    try {
        return JSON.parse(data)
    } catch {
        throw new Error('MCP server returned invalid JSON in an event stream')
    }
}

function parseJsonRpcResult<TSchema extends z.ZodType<object>>(
    payload: unknown,
    resultSchema: TSchema
): z.infer<TSchema> {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('MCP server returned an invalid JSON-RPC response')
    }
    const error = Reflect.get(payload, 'error')
    if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
        const code = Reflect.get(error, 'code')
        const message = Reflect.get(error, 'message')
        throw new McpConsumerProtocolError(
            typeof message === 'string' ? message : 'MCP request failed',
            typeof code === 'number' ? code : undefined,
            Reflect.get(error, 'data')
        )
    }
    return resultSchema.parse(Reflect.get(payload, 'result'))
}

async function* readSseNotifications(
    body: ReadableStream<Uint8Array>,
    dispose: () => void
): AsyncIterable<McpConsumerNotification> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            let boundary = buffer.indexOf('\n\n')
            while (boundary >= 0) {
                const event = buffer.slice(0, boundary)
                buffer = buffer.slice(boundary + 2)
                assertSseEventSize(event)
                const notification = parseSseEvent(event)
                if (notification) yield notification
                boundary = buffer.indexOf('\n\n')
            }
            assertSseEventSize(buffer)
        }
    } finally {
        reader.releaseLock()
        dispose()
    }
}

function assertSseEventSize(value: string) {
    if (Buffer.byteLength(value, 'utf8') > MAX_JSON_RESPONSE_BYTES) {
        throw new Error('MCP subscription event exceeds the maximum allowed size')
    }
}

function parseSseEvent(event: string): McpConsumerNotification | null {
    const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
    if (!data) return null
    let payload: unknown
    try {
        payload = JSON.parse(data)
    } catch {
        throw new Error('MCP subscription returned invalid JSON')
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
    const method = Reflect.get(payload, 'method')
    const params = Reflect.get(payload, 'params')
    if (typeof method !== 'string') return null
    return {
        method,
        ...(typeof params === 'object' && params !== null && !Array.isArray(params) ? { params } : {})
    }
}
