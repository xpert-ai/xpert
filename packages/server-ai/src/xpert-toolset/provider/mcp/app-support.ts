import { DynamicStructuredTool } from '@langchain/core/tools'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { Client as McpSdkClient, type Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import {
    ListResourcesResultSchema,
    ListToolsResultSchema,
    ReadResourceResultSchema
} from '@modelcontextprotocol/sdk/types.js'
import {
    MCP_APP_RESOURCE_MIME_TYPE,
    type IXpertTool,
    type IXpertToolset,
    type IconDefinition,
    type I18nObject,
    type TMcpAppComponentData,
    type TMcpAppCsp,
    type TMcpAppPermissions,
    type TMcpAppToolResult,
    type TMcpAppToolResultContentBlock,
    type TMcpAppUiMeta,
    type TMcpAppVisibility,
    type TMcpToolAppMeta,
    isToolEnabled
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mcpStdioRuntimeManager } from './mcp-stdio-runtime'
import type { McpAppInstanceSnapshot } from '../../../mcp-app-runtime'
import { LangChainMcpConnection } from '../../../mcp-consumer/connection/langchain-mcp-connection'
import {
    McpConsumerCallToolResult,
    mcpConsumerCallToolResultSchema
} from '../../../mcp-consumer/tools/mcp-consumer-call-tool-result'
import { applicationMetrics } from '../../../metrics/application-metrics'

const MCP_APP_INSTANCE_TTL_MS = 30 * 60 * 1000
const MCP_APP_RESOURCE_MAX_BYTES = 2 * 1024 * 1024
const MCP_APP_HISTORY_TOOL_RESULT_MAX_BYTES = 128 * 1024
const MCP_APP_MESSAGE_MAX_BYTES = 25 * 1024 * 1024
const MCP_APP_LOG_MAX_BYTES = 64 * 1024
const MCP_APP_MESSAGE_MAX_CONTENT_BLOCKS = 100
const MCP_APP_PERSISTED_TEXT_PREVIEW_LENGTH = 4_096
const MCP_APP_UI_EXTENSION_ID = 'io.modelcontextprotocol/ui'
const bridgedMcpAppClients = new WeakSet<MultiServerMCPClient>()
let mcpUiClientCapabilitiesBridgeInstalled = false

export type McpToolLike = {
    name: string
    description?: string
    inputSchema?: Record<string, unknown>
    annotations?: Record<string, unknown>
    execution?: {
        taskSupport?: 'required' | 'optional' | 'forbidden'
    }
    _meta?: Record<string, unknown>
}

type McpLoadToolsOptionsByServer = Record<
    string,
    {
        prefixToolNameWithServerName?: boolean
        additionalToolNamePrefix?: string
    }
>

type McpClientPrivateState = {
    _loadToolsOptions?: McpLoadToolsOptionsByServer
}

type McpSdkClientWithCapabilities = Client & {
    registerCapabilities?: (capabilities: Record<string, unknown>) => void
    transport?: unknown
}

export type McpAppInstance = {
    id: string
    userId?: string
    client: MultiServerMCPClient
    destroy?: (() => Promise<void>) | null
    closeClientOnExpire?: boolean
    toolset: Pick<IXpertToolset, 'id' | 'name' | 'tools' | 'options' | 'tenantId' | 'organizationId' | 'workspaceId'>
    toolMeta: TMcpToolAppMeta
    toolCallId?: string
    toolInput?: Record<string, unknown>
    toolResult?: TMcpAppToolResult
    modelContext?: {
        content?: unknown
        structuredContent?: Record<string, unknown>
        updatedAt: number
    }
    messages: unknown[]
    logs: unknown[]
    stateVersion: number
    createdAt: number
    expiresAt: number
}

type McpAppMessageContentBlock =
    | (Record<string, unknown> & { type: 'text'; text: string })
    | (Record<string, unknown> & { type: 'image' | 'audio'; data: string; mimeType: string })
    | (Record<string, unknown> & {
          type: 'resource'
          resource: Record<string, unknown> &
              ({ uri: string; mimeType?: string; text: string } | { uri: string; mimeType?: string; blob: string })
      })
    | (Record<string, unknown> & { type: 'resource_link'; uri: string })

const mcpAppInstances = new Map<string, McpAppInstance>()

type McpAppInstancePersistence = {
    save(snapshot: McpAppInstanceSnapshot): Promise<boolean>
    get(appInstanceId: string): Promise<McpAppInstanceSnapshot | null>
    delete(appInstanceId: string): Promise<void>
    onError?(operation: 'save' | 'delete', error: unknown): void
}

let mcpAppInstancePersistence: McpAppInstancePersistence | null = null
const pendingMcpAppInstancePersistence = new Map<string, Promise<void>>()
const pendingMcpAppInstanceMutations = new Map<string, Promise<unknown>>()

export function configureMcpAppInstancePersistence(persistence: McpAppInstancePersistence | null) {
    mcpAppInstancePersistence = persistence
}

export function snapshotMcpAppInstance(instance: McpAppInstance): McpAppInstanceSnapshot {
    const resourceUri = instance.toolMeta.ui?.resourceUri
    if (!resourceUri) throw new Error('MCP App instance does not have a resource URI')
    return {
        version: 1,
        stateVersion: instance.stateVersion,
        appInstanceId: instance.id,
        tenantId: instance.toolset.tenantId,
        organizationId: instance.toolset.organizationId,
        workspaceId: instance.toolset.workspaceId,
        userId: instance.userId,
        toolsetId: instance.toolset.id,
        serverName: instance.toolMeta.serverName,
        toolName: instance.toolMeta.name,
        displayName: instance.toolMeta.displayName,
        resourceUri,
        toolCallId: instance.toolCallId,
        toolInput: instance.toolInput,
        toolResult: instance.toolResult,
        modelContext: instance.modelContext,
        messages: instance.messages.slice(-20).map(persistedMcpAppMessageSummary),
        logs: instance.logs.slice(-50).map(persistedMcpAppLogSummary),
        createdAt: instance.createdAt,
        expiresAt: instance.expiresAt
    }
}

function persistMcpAppInstance(instance: McpAppInstance) {
    if (!mcpAppInstancePersistence) return Promise.resolve()
    const persistence = mcpAppInstancePersistence
    const snapshot = snapshotMcpAppInstance(instance)
    return enqueueMcpAppInstancePersistence(instance.id, persistence, 'save', async () => {
        const saved = await persistence.save(snapshot)
        if (saved) return

        const current = await persistence.get(instance.id)
        if (current) {
            applyMcpAppInstanceSnapshot(instance, current, { allowEqualVersion: true })
        } else {
            deleteMcpAppInstanceRecord(instance.id)
            closeMcpAppInstanceClient({ ...instance, closeClientOnExpire: true })
        }
        throw new Error('MCP App state changed on another API replica; retry the request')
    })
}

function deletePersistedMcpAppInstance(appInstanceId: string) {
    if (!mcpAppInstancePersistence) return Promise.resolve()
    const persistence = mcpAppInstancePersistence
    return enqueueMcpAppInstancePersistence(appInstanceId, persistence, 'delete', () =>
        persistence.delete(appInstanceId)
    )
}

function enqueueMcpAppInstancePersistence(
    appInstanceId: string,
    persistence: McpAppInstancePersistence,
    operation: 'save' | 'delete',
    task: () => Promise<void>
) {
    const previous = pendingMcpAppInstancePersistence.get(appInstanceId) ?? Promise.resolve()
    const pending = previous.catch(() => undefined).then(task)
    pendingMcpAppInstancePersistence.set(appInstanceId, pending)
    pending.then(
        () => {
            if (pendingMcpAppInstancePersistence.get(appInstanceId) === pending) {
                pendingMcpAppInstancePersistence.delete(appInstanceId)
            }
        },
        (error) => {
            persistence.onError?.(operation, error)
            if (pendingMcpAppInstancePersistence.get(appInstanceId) === pending) {
                pendingMcpAppInstancePersistence.delete(appInstanceId)
            }
        }
    )
    return pending
}

export function waitForMcpAppInstancePersistence(appInstanceId: string) {
    return pendingMcpAppInstancePersistence.get(appInstanceId) ?? Promise.resolve()
}

export function runMcpAppInstanceMutation<T>(appInstanceId: string, task: () => Promise<T>): Promise<T> {
    const previous = pendingMcpAppInstanceMutations.get(appInstanceId) ?? Promise.resolve()
    const pending = previous.catch(() => undefined).then(task)
    pendingMcpAppInstanceMutations.set(appInstanceId, pending)
    pending.then(
        () => clearMcpAppInstanceMutation(appInstanceId, pending),
        () => clearMcpAppInstanceMutation(appInstanceId, pending)
    )
    return pending
}

function clearMcpAppInstanceMutation(appInstanceId: string, pending: Promise<unknown>) {
    if (pendingMcpAppInstanceMutations.get(appInstanceId) === pending) {
        pendingMcpAppInstanceMutations.delete(appInstanceId)
    }
}

type McpAppInstanceTokenPayload = {
    v: 1
    appInstanceId: string
    tenantId?: string
    organizationId?: string
    workspaceId?: string
    userId?: string
    toolsetId?: string
    serverName?: string
    toolName?: string
    displayName?: string
    resourceUri?: string
    toolCallId?: string
    exp: number
}

type VerifyMcpAppInstanceTokenOptions = {
    ignoreExpiration?: boolean
}

export type McpAppInstanceTokenExpected = Partial<
    Pick<
        McpAppInstanceTokenPayload,
        | 'appInstanceId'
        | 'tenantId'
        | 'organizationId'
        | 'workspaceId'
        | 'userId'
        | 'toolsetId'
        | 'serverName'
        | 'toolName'
        | 'resourceUri'
        | 'toolCallId'
    >
>

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

type ToolResultObjectInput = Record<string, unknown> & {
    toolResult?: unknown
    content?: unknown
    structuredContent?: unknown
    isError?: unknown
    _meta?: unknown
}

type ToolResultArtifactInput = Record<string, unknown> | readonly ToolResultArtifactInput[]

type LangChainToolResultTuple = readonly [content: unknown, artifact: unknown, ...rest: unknown[]]

function isToolResultArtifactInput(value: unknown): value is ToolResultArtifactInput {
    if (Array.isArray(value)) {
        return value.every(isToolResultArtifactInput)
    }
    return isRecord(value)
}

function isLangChainToolResultTuple(value: unknown): value is LangChainToolResultTuple {
    return Array.isArray(value) && value.length >= 2
}

function normalizeInputSchema(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : { type: 'object', properties: {} }
}

function base64UrlJson(value: unknown) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function readPositiveIntegerEnv(name: string, fallback: number) {
    const raw = process.env[name]?.trim()
    if (!raw) {
        return fallback
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getMcpAppTokenSecret() {
    const secret =
        process.env.XPERT_MCP_APP_TOKEN_SECRET?.trim() ||
        process.env.JWT_SECRET?.trim() ||
        process.env.SECRET_KEY?.trim()
    if (secret) {
        return secret
    }
    if (!environment.production) {
        return 'xpert-mcp-app-dev-secret'
    }
    throw new Error('XPERT_MCP_APP_TOKEN_SECRET is required to host MCP Apps in production')
}

function signMcpAppTokenPayload(encodedPayload: string) {
    return createHmac('sha256', getMcpAppTokenSecret()).update(encodedPayload).digest('base64url')
}

function signaturesEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function createMcpAppInstanceToken(instance: McpAppInstance) {
    const payload: McpAppInstanceTokenPayload = {
        v: 1,
        appInstanceId: instance.id,
        tenantId: instance.toolset.tenantId,
        organizationId: instance.toolset.organizationId,
        workspaceId: instance.toolset.workspaceId,
        userId: instance.userId,
        toolsetId: instance.toolset.id,
        serverName: instance.toolMeta.serverName,
        toolName: instance.toolMeta.name,
        displayName: instance.toolMeta.displayName,
        resourceUri: instance.toolMeta.ui?.resourceUri,
        toolCallId: instance.toolCallId,
        exp: instance.expiresAt
    }
    const encodedPayload = base64UrlJson(payload)
    return `${encodedPayload}.${signMcpAppTokenPayload(encodedPayload)}`
}

function readMcpAppInstanceTokenPayload(
    token: string,
    options?: VerifyMcpAppInstanceTokenOptions
): McpAppInstanceTokenPayload {
    const [encodedPayload, signature, extra] = token.split('.')
    if (!encodedPayload || !signature || extra) {
        throw new Error('Invalid MCP App token')
    }
    const expectedSignature = signMcpAppTokenPayload(encodedPayload)
    if (!signaturesEqual(signature, expectedSignature)) {
        throw new Error('Invalid MCP App token signature')
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as McpAppInstanceTokenPayload
    if (payload.v !== 1 || !payload.appInstanceId || !Number.isFinite(payload.exp)) {
        throw new Error('Invalid MCP App token payload')
    }
    if (!options?.ignoreExpiration && payload.exp <= Date.now()) {
        throw new Error('MCP App token has expired')
    }
    return payload
}

function assertTokenField(
    payload: McpAppInstanceTokenPayload,
    expected: McpAppInstanceTokenExpected,
    key: keyof McpAppInstanceTokenExpected
) {
    const expectedValue = expected[key]
    if (!expectedValue) {
        return
    }
    if (key === 'toolName') {
        if (payload.toolName === expectedValue || payload.displayName === expectedValue) {
            return
        }
        throw new Error('MCP App token does not match this tool')
    }
    if (payload[key] !== expectedValue) {
        throw new Error(`MCP App token does not match ${key}`)
    }
}

export function verifyMcpAppInstanceToken(
    token: string,
    expected: McpAppInstanceTokenExpected,
    options?: VerifyMcpAppInstanceTokenOptions
) {
    const payload = readMcpAppInstanceTokenPayload(token, options)
    assertTokenField(payload, expected, 'appInstanceId')
    assertTokenField(payload, expected, 'tenantId')
    assertTokenField(payload, expected, 'organizationId')
    assertTokenField(payload, expected, 'workspaceId')
    assertTokenField(payload, expected, 'userId')
    assertTokenField(payload, expected, 'toolsetId')
    assertTokenField(payload, expected, 'serverName')
    assertTokenField(payload, expected, 'toolName')
    assertTokenField(payload, expected, 'resourceUri')
    assertTokenField(payload, expected, 'toolCallId')
    return payload
}

export function refreshMcpAppInstanceToken(instance: McpAppInstance, now = Date.now()) {
    instance.expiresAt = now + MCP_APP_INSTANCE_TTL_MS
    markMcpAppInstanceChanged(instance)
    persistMcpAppInstance(instance)
    return createMcpAppInstanceToken(instance)
}

export function isMcpAppTokenRequired() {
    const raw = process.env.XPERT_MCP_APP_TOKEN_REQUIRED?.trim().toLowerCase()
    return environment.production || Boolean(raw && ['1', 'true', 'yes', 'on'].includes(raw))
}

export function installMcpUiClientCapabilitiesBridge(): void {
    if (mcpUiClientCapabilitiesBridgeInstalled) {
        return
    }
    mcpUiClientCapabilitiesBridgeInstalled = true

    const prototype = McpSdkClient.prototype as McpSdkClientWithCapabilities
    const originalConnect = prototype.connect
    prototype.connect = async function connectWithMcpAppsCapability(
        this: McpSdkClientWithCapabilities,
        ...args: Parameters<Client['connect']>
    ) {
        if (!this.transport && typeof this.registerCapabilities === 'function') {
            this.registerCapabilities({
                elicitation: {
                    form: {},
                    url: {}
                },
                extensions: {
                    [MCP_APP_UI_EXTENSION_ID]: {
                        mimeTypes: [MCP_APP_RESOURCE_MIME_TYPE]
                    }
                }
            })
        }
        return originalConnect.apply(this, args)
    } as Client['connect']
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }
    const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    return strings.length ? strings : undefined
}

function normalizeI18nText(value: unknown): string | I18nObject | undefined {
    const text = readString(value)
    if (text) {
        return text
    }
    if (!isRecord(value)) {
        return undefined
    }

    const localized: Record<string, string> = {}
    for (const [key, item] of Object.entries(value)) {
        const localizedText = readString(item)
        if (localizedText) {
            localized[key] = localizedText
        }
    }

    return Object.keys(localized).length ? (localized as unknown as I18nObject) : undefined
}

function normalizeIconStyle(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) {
        return undefined
    }
    const style: Record<string, string> = {}
    for (const [key, item] of Object.entries(value)) {
        const cssValue = readString(item)
        if (cssValue) {
            style[key] = cssValue
        }
    }
    return Object.keys(style).length ? style : undefined
}

function normalizeIconDefinition(value: unknown): IconDefinition | undefined {
    if (!isRecord(value)) {
        return undefined
    }

    const type = readString(value.type)
    const iconValue = readString(value.value)
    if (!type || !iconValue || !['image', 'svg', 'font', 'emoji', 'lottie'].includes(type)) {
        return undefined
    }

    const icon: IconDefinition = {
        type: type as IconDefinition['type'],
        value: iconValue
    }
    const color = readString(value.color)
    const size = readNumber(value.size)
    const alt = readString(value.alt)
    const style = normalizeIconStyle(value.style)

    if (color) {
        icon.color = color
    }
    if (size && size > 0 && size <= 256) {
        icon.size = size
    }
    if (alt) {
        icon.alt = alt
    }
    if (style) {
        icon.style = style
    }

    return icon
}

function normalizeCsp(value: unknown): TMcpAppCsp | undefined {
    if (!isRecord(value)) {
        return undefined
    }

    const csp: TMcpAppCsp = {
        connectDomains: readStringArray(value.connectDomains),
        resourceDomains: readStringArray(value.resourceDomains),
        frameDomains: readStringArray(value.frameDomains),
        baseUriDomains: readStringArray(value.baseUriDomains)
    }

    return Object.values(csp).some(Boolean) ? csp : undefined
}

function normalizePermissionGrant(value: unknown): TMcpAppPermissions[keyof TMcpAppPermissions] | undefined {
    if (value === true) {
        return {}
    }
    if (value === false || value === undefined || value === null) {
        return undefined
    }
    if (isRecord(value)) {
        return value
    }
    return undefined
}

function normalizePermissions(value: unknown): TMcpAppPermissions | undefined {
    if (!isRecord(value)) {
        return undefined
    }

    const permissions: TMcpAppPermissions = {
        camera: normalizePermissionGrant(value.camera),
        microphone: normalizePermissionGrant(value.microphone),
        geolocation: normalizePermissionGrant(value.geolocation),
        clipboardWrite: normalizePermissionGrant(value.clipboardWrite)
    }

    return Object.values(permissions).some((item) => item !== undefined) ? permissions : undefined
}

function normalizeVisibility(value: unknown): TMcpAppVisibility[] {
    if (!Array.isArray(value)) {
        return ['model', 'app']
    }

    const visibility = value.filter((item): item is TMcpAppVisibility => item === 'model' || item === 'app')
    return visibility.length ? Array.from(new Set(visibility)) : ['model', 'app']
}

export function extractMcpAppUiMeta(meta: unknown): TMcpAppUiMeta | undefined {
    if (!isRecord(meta)) {
        return undefined
    }

    const ui = isRecord(meta.ui) ? meta.ui : null
    const resourceUri =
        readString(ui?.resourceUri) ?? readString(meta['ui/resourceUri']) ?? readString(meta['openai/outputTemplate'])

    if (!resourceUri?.startsWith('ui://')) {
        return undefined
    }

    return {
        resourceUri,
        title: normalizeI18nText(ui?.title),
        description: normalizeI18nText(ui?.description),
        icon: normalizeIconDefinition(ui?.icon),
        // Legacy fallback only. MCP Apps resource security metadata belongs on the resource `_meta.ui`.
        csp: normalizeCsp(ui?.csp),
        // Legacy fallback only. MCP Apps resource security metadata belongs on the resource `_meta.ui`.
        permissions: normalizePermissions(ui?.permissions),
        domain: readString(ui?.domain),
        prefersBorder: readBoolean(ui?.prefersBorder)
    }
}

function extractMcpAppResourceUiMeta(value: unknown): Partial<Omit<TMcpAppUiMeta, 'resourceUri'>> | undefined {
    if (!isRecord(value)) {
        return undefined
    }

    const meta = isRecord(value._meta) ? value._meta : value
    const ui = isRecord(meta.ui) ? meta.ui : undefined
    if (!ui) {
        return undefined
    }

    const resourceUi: Partial<Omit<TMcpAppUiMeta, 'resourceUri'>> = {
        title: normalizeI18nText(ui.title) ?? normalizeI18nText(meta.title) ?? normalizeI18nText(value.title),
        description:
            normalizeI18nText(ui.description) ??
            normalizeI18nText(meta.description) ??
            normalizeI18nText(value.description),
        icon:
            normalizeIconDefinition(ui.icon) ??
            normalizeIconDefinition(meta.icon) ??
            normalizeIconDefinition(value.icon),
        csp: normalizeCsp(ui.csp),
        permissions: normalizePermissions(ui.permissions),
        domain: readString(ui.domain),
        prefersBorder: readBoolean(ui.prefersBorder)
    }

    return Object.values(resourceUi).some((item) => item !== undefined) ? resourceUi : undefined
}

function mergeMcpAppUiMeta(
    resourceUri: string,
    toolUi: TMcpAppUiMeta | undefined,
    resourceUi: Partial<Omit<TMcpAppUiMeta, 'resourceUri'>> | undefined
): TMcpAppUiMeta {
    return {
        resourceUri,
        title: resourceUi?.title ?? toolUi?.title,
        description: resourceUi?.description ?? toolUi?.description,
        icon: resourceUi?.icon ?? toolUi?.icon,
        csp: resourceUi?.csp ?? toolUi?.csp,
        permissions: resourceUi?.permissions ?? toolUi?.permissions,
        domain: resourceUi?.domain ?? toolUi?.domain,
        prefersBorder: resourceUi?.prefersBorder ?? toolUi?.prefersBorder
    }
}

function extractMcpAppVisibility(meta: unknown): TMcpAppVisibility[] {
    return normalizeVisibility(isRecord(meta) && isRecord(meta.ui) ? meta.ui.visibility : undefined)
}

function getToolDisplayName(serverName: string, toolName: string, options?: McpLoadToolsOptionsByServer[string]) {
    const additionalPrefix = options?.additionalToolNamePrefix ? `${options.additionalToolNamePrefix}__` : ''
    const serverPrefix = options?.prefixToolNameWithServerName ? `${serverName}__` : ''
    return `${additionalPrefix}${serverPrefix}${toolName}`
}

async function listSdkTools(sdkClient: Client): Promise<McpToolLike[]> {
    const tools: McpToolLike[] = []
    let cursor: string | undefined

    do {
        const response = await sdkClient.listTools(cursor ? { cursor } : undefined)
        tools.push(...((response.tools ?? []) as McpToolLike[]))
        cursor = response.nextCursor
    } while (cursor)

    return tools
}

async function listClientTools(
    client: MultiServerMCPClient,
    connection: LangChainMcpConnection,
    serverName: string
): Promise<McpToolLike[]> {
    if (!connection.usesModernHttp(serverName)) {
        const sdkClient = await client.getClient(serverName)
        return sdkClient ? listSdkTools(sdkClient) : []
    }

    const tools: McpToolLike[] = []
    let cursor: string | undefined
    do {
        const response = await connection.requestExtension(
            serverName,
            { method: 'tools/list', params: cursor ? { cursor } : {} },
            ListToolsResultSchema,
            { routing: { method: 'tools/list' } }
        )
        for (const tool of response.tools) {
            if (typeof tool.name === 'string' && tool.name) {
                tools.push(normalizeMcpToolLike({ ...tool, name: tool.name }))
            }
        }
        cursor = response.nextCursor
    } while (cursor)
    return tools
}

export async function listMcpToolAppMetadata(client: MultiServerMCPClient): Promise<TMcpToolAppMeta[]> {
    const connection = new LangChainMcpConnection(client)
    const serverNames = connection.serverNames()
    const loadOptions = (client as unknown as McpClientPrivateState)._loadToolsOptions ?? {}
    const metadata: TMcpToolAppMeta[] = []

    for (const serverName of serverNames) {
        for (const tool of await listClientTools(client, connection, serverName)) {
            metadata.push(
                createMcpToolAppMeta(
                    serverName,
                    getToolDisplayName(serverName, tool.name, loadOptions[serverName]),
                    tool
                )
            )
        }
    }

    return metadata
}

function normalizeMcpToolLike(tool: {
    name: string
    description?: string
    inputSchema?: object
    annotations?: object
}): McpToolLike {
    const metaValue = Reflect.get(tool, '_meta')
    const executionValue = Reflect.get(tool, 'execution')
    const taskSupport =
        typeof executionValue === 'object' && executionValue !== null && !Array.isArray(executionValue)
            ? Reflect.get(executionValue, 'taskSupport')
            : undefined
    return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ? Object.fromEntries(Object.entries(tool.inputSchema)) : undefined,
        annotations: tool.annotations ? Object.fromEntries(Object.entries(tool.annotations)) : undefined,
        ...(taskSupport === 'required' || taskSupport === 'optional' || taskSupport === 'forbidden'
            ? { execution: { taskSupport } }
            : {}),
        ...(typeof metaValue === 'object' && metaValue !== null && !Array.isArray(metaValue)
            ? { _meta: Object.fromEntries(Object.entries(metaValue)) }
            : {})
    }
}

export function createMcpToolAppMeta(serverName: string, displayName: string, tool: McpToolLike): TMcpToolAppMeta {
    const meta = isRecord(tool._meta) ? tool._meta : undefined
    return {
        serverName,
        name: tool.name,
        displayName,
        inputSchema: normalizeInputSchema(tool.inputSchema),
        visibility: extractMcpAppVisibility(meta),
        ui: extractMcpAppUiMeta(meta),
        annotations: tool.annotations,
        execution: tool.execution,
        _meta: meta
    }
}

export function getMcpToolAppMeta(tool: DynamicStructuredTool): TMcpToolAppMeta | undefined {
    const metadata = tool.metadata as Record<string, unknown> | undefined
    const appMeta = metadata?.mcpApp
    return isRecord(appMeta) ? (appMeta as TMcpToolAppMeta) : undefined
}

function setMcpToolAppMeta(tool: DynamicStructuredTool, appMeta: TMcpToolAppMeta) {
    tool.metadata = {
        ...(tool.metadata ?? {}),
        mcpApp: appMeta
    }
}

export async function annotateMcpToolsWithAppMetadata(client: MultiServerMCPClient, tools: DynamicStructuredTool[]) {
    const toolMetadata = await listMcpToolAppMetadata(client)
    const metadataByDisplayName = new Map(toolMetadata.map((item) => [item.displayName, item]))
    const metadataByName = new Map(toolMetadata.map((item) => [item.name, item]))

    for (const tool of tools) {
        const appMeta = metadataByDisplayName.get(tool.name) ?? metadataByName.get(tool.name)
        if (appMeta) {
            setMcpToolAppMeta(tool, appMeta)
        }
    }

    return tools
}

export function installMcpToolAppMetadataBridge(client: MultiServerMCPClient): void {
    if (bridgedMcpAppClients.has(client)) {
        return
    }
    bridgedMcpAppClients.add(client)

    const originalGetTools = client.getTools.bind(client)
    client.getTools = async (...servers: string[]) => {
        const tools = await originalGetTools(...servers)
        return annotateMcpToolsWithAppMetadata(client, tools)
    }
}

export function isMcpToolVisibleToModel(tool: DynamicStructuredTool): boolean {
    const appMeta = getMcpToolAppMeta(tool)
    return appMeta?.visibility?.includes('model') ?? true
}

function readArtifactMeta(value: unknown): Record<string, unknown> | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const meta = readArtifactMeta(item)
            if (meta) {
                return meta
            }
        }
        return undefined
    }

    return isRecord(value) ? value : undefined
}

function stringifyToolResult(value: unknown) {
    if (typeof value === 'string') {
        return value
    }
    try {
        return JSON.stringify(value ?? null)
    } catch {
        return String(value)
    }
}

function normalizeToolResultContent(value: readonly unknown[]): TMcpAppToolResultContentBlock[] {
    return value.filter(
        (item): item is TMcpAppToolResultContentBlock => isRecord(item) && typeof item.type === 'string'
    )
}

function extractToolResultArtifact(value: ToolResultArtifactInput): Partial<TMcpAppToolResult> {
    if (Array.isArray(value)) {
        return value.reduce<Partial<TMcpAppToolResult>>((result, item) => {
            const normalized = extractToolResultArtifact(item)
            return {
                ...result,
                ...normalized,
                structuredContent: result.structuredContent ?? normalized.structuredContent,
                isError: result.isError ?? normalized.isError,
                _meta: result._meta ?? normalized._meta
            }
        }, {})
    }

    const artifact = value as Record<string, unknown>
    const structuredContent = isRecord(artifact.structuredContent) ? artifact.structuredContent : undefined
    const isError = typeof artifact.isError === 'boolean' ? artifact.isError : undefined
    const explicitMeta = isRecord(artifact._meta) ? artifact._meta : undefined
    const legacyMeta = Object.fromEntries(
        Object.entries(artifact).filter(([key]) => !['structuredContent', 'isError', '_meta'].includes(key))
    )
    const _meta = explicitMeta ?? (Object.keys(legacyMeta).length ? legacyMeta : undefined)

    return {
        ...(structuredContent ? { structuredContent } : {}),
        ...(isError !== undefined ? { isError } : {}),
        ...(_meta ? { _meta } : {})
    }
}

function normalizeToolResultObject(value: ToolResultObjectInput): TMcpAppToolResult {
    if (value.toolResult !== undefined && !Array.isArray(value.content)) {
        return normalizeMcpAppToolResult(value.toolResult) ?? { content: [] }
    }

    const result: TMcpAppToolResult = {
        content: Array.isArray(value.content) ? normalizeToolResultContent(value.content) : []
    }
    if (isRecord(value.structuredContent)) {
        result.structuredContent = value.structuredContent
    }
    if (typeof value.isError === 'boolean') {
        result.isError = value.isError
    }
    if (isRecord(value._meta)) {
        result._meta = value._meta
    }
    return result
}

function normalizeLangChainToolResultTuple(value: LangChainToolResultTuple): TMcpAppToolResult {
    const [content, artifact] = value
    return {
        content: [
            {
                type: 'text',
                text: typeof content === 'string' ? content : stringifyToolResult(content)
            }
        ],
        ...(isToolResultArtifactInput(artifact) ? extractToolResultArtifact(artifact) : {})
    }
}

export function normalizeMcpAppToolResult(value: unknown): TMcpAppToolResult | undefined {
    if (value === undefined) {
        return undefined
    }

    if (isRecord(value)) {
        return normalizeToolResultObject(value)
    }

    if (isLangChainToolResultTuple(value)) {
        return normalizeLangChainToolResultTuple(value)
    }

    return {
        content: [
            {
                type: 'text',
                text: stringifyToolResult(value)
            }
        ]
    }
}

function getSerializedByteSize(value: unknown) {
    try {
        return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8')
    } catch {
        return Number.POSITIVE_INFINITY
    }
}

function createPersistedToolResultSnapshot(toolResult: TMcpAppToolResult | undefined) {
    if (!toolResult) {
        return {}
    }

    const toolResultSize = getSerializedByteSize(toolResult)
    const maxBytes = readPositiveIntegerEnv(
        'XPERT_MCP_APP_HISTORY_TOOL_RESULT_MAX_BYTES',
        MCP_APP_HISTORY_TOOL_RESULT_MAX_BYTES
    )
    if (toolResultSize <= maxBytes) {
        return {
            toolResult,
            toolResultSize,
            toolResultTruncated: false
        }
    }

    return {
        toolResultSize,
        toolResultTruncated: true
    }
}

function extractToolResultMeta(toolResult: unknown): Record<string, unknown> | undefined {
    if (isRecord(toolResult)) {
        return isRecord(toolResult._meta) ? toolResult._meta : toolResult
    }
    if (Array.isArray(toolResult) && toolResult.length >= 2) {
        return readArtifactMeta(toolResult[1])
    }
    return undefined
}

function resolveToolEnabled(toolset: Pick<IXpertToolset, 'tools' | 'options'>, toolName: string, displayName: string) {
    const disableToolDefault = toolset.options?.disableToolDefault
    const config = toolset.tools?.find((tool) => tool.name === displayName || tool.name === toolName)
    if (config) {
        return isToolEnabled(config as IXpertTool, disableToolDefault)
    }
    return !disableToolDefault
}

function closeMcpAppInstanceClient(instance: McpAppInstance) {
    if (!instance.closeClientOnExpire) {
        return
    }
    instance.destroy?.().catch(() => undefined)
    instance.client.close().catch(() => undefined)
}

function pruneExpiredMcpAppInstances(now = Date.now()) {
    for (const [id, instance] of mcpAppInstances) {
        if (instance.expiresAt <= now) {
            deleteMcpAppInstanceRecord(id)
            closeMcpAppInstanceClient(instance)
        }
    }
}

export function isMcpAppsEnabled(): boolean {
    const raw = process.env.XPERT_MCP_APPS_ENABLED?.trim().toLowerCase()
    if (raw) {
        return ['1', 'true', 'yes', 'on'].includes(raw)
    }
    return !environment.production
}

export function registerMcpAppInstance(options: {
    client: MultiServerMCPClient
    userId?: string
    toolset: Pick<IXpertToolset, 'id' | 'name' | 'tools' | 'options' | 'tenantId' | 'organizationId' | 'workspaceId'>
    tool: DynamicStructuredTool
    toolCallId?: string
    toolInput?: unknown
    toolResult?: unknown
}): TMcpAppComponentData | null {
    if (!isMcpAppsEnabled()) {
        return null
    }

    const toolMeta = getMcpToolAppMeta(options.tool)
    if (!toolMeta || !toolMeta.visibility.includes('app')) {
        return null
    }

    const resultMeta = extractToolResultMeta(options.toolResult)
    const ui = extractMcpAppUiMeta(resultMeta) ?? toolMeta.ui
    if (!ui?.resourceUri) {
        return null
    }

    if (!resolveToolEnabled(options.toolset, toolMeta.name, toolMeta.displayName)) {
        return null
    }

    const toolInput = isRecord(options.toolInput) ? options.toolInput : {}
    const toolResult = normalizeMcpAppToolResult(options.toolResult)
    const persistedToolResultSnapshot = createPersistedToolResultSnapshot(toolResult)
    const now = Date.now()
    pruneExpiredMcpAppInstances(now)

    const id = randomUUID()
    const instance: McpAppInstance = {
        id,
        userId: options.userId,
        client: options.client,
        destroy: null,
        closeClientOnExpire: false,
        toolset: options.toolset,
        toolMeta: {
            ...toolMeta,
            ui
        },
        toolCallId: options.toolCallId,
        toolInput,
        toolResult,
        messages: [],
        logs: [],
        stateVersion: 1,
        createdAt: now,
        expiresAt: now + MCP_APP_INSTANCE_TTL_MS
    }

    mcpAppInstances.set(id, instance)
    applicationMetrics.startMcpAppInstance({ publicationId: 'consumer' })
    persistMcpAppInstance(instance)
    mcpStdioRuntimeManager.attachAppInstance(options.client, id)

    return {
        type: 'McpApp',
        appInstanceId: id,
        appInstanceToken: createMcpAppInstanceToken(instance),
        resourceUri: ui.resourceUri,
        toolName: options.tool.name,
        toolCallId: options.toolCallId,
        toolsetId: options.toolset.id,
        serverName: toolMeta.serverName,
        title: ui.title ?? options.tool.description ?? options.tool.name,
        description: ui.description,
        icon: ui.icon,
        csp: ui.csp,
        permissions: ui.permissions,
        domain: ui.domain,
        prefersBorder: ui.prefersBorder,
        toolInput,
        ...persistedToolResultSnapshot,
        visibility: toolMeta.visibility,
        status: 'success'
    }
}

export function restoreMcpAppInstance(options: {
    id: string
    client: MultiServerMCPClient
    userId?: string
    destroy?: (() => Promise<void>) | null
    toolset: Pick<IXpertToolset, 'id' | 'name' | 'tools' | 'options' | 'tenantId' | 'organizationId' | 'workspaceId'>
    toolMeta: TMcpToolAppMeta
    toolCallId?: string
    toolInput?: unknown
    toolResult?: unknown
    modelContext?: McpAppInstance['modelContext']
    messages?: unknown[]
    logs?: unknown[]
    stateVersion?: number
    createdAt?: number
    expiresAt?: number
}): McpAppInstance | null {
    if (!isMcpAppsEnabled()) {
        return null
    }

    const ui = options.toolMeta.ui
    if (!ui?.resourceUri?.startsWith('ui://') || !options.toolMeta.visibility.includes('app')) {
        return null
    }

    if (!resolveToolEnabled(options.toolset, options.toolMeta.name, options.toolMeta.displayName)) {
        return null
    }

    const now = Date.now()
    pruneExpiredMcpAppInstances(now)
    const expiresAt = Math.max(now + MCP_APP_INSTANCE_TTL_MS, options.expiresAt ?? 0)
    const stateVersion =
        (options.stateVersion ?? 1) + (options.expiresAt !== undefined && expiresAt > options.expiresAt ? 1 : 0)

    const instance: McpAppInstance = {
        id: options.id,
        userId: options.userId,
        client: options.client,
        destroy: options.destroy ?? null,
        closeClientOnExpire: true,
        toolset: options.toolset,
        toolMeta: options.toolMeta,
        toolCallId: options.toolCallId,
        toolInput: isRecord(options.toolInput) ? options.toolInput : {},
        toolResult: normalizeMcpAppToolResult(options.toolResult),
        modelContext: options.modelContext,
        messages: options.messages?.slice(-20) ?? [],
        logs: options.logs?.slice(-50) ?? [],
        stateVersion,
        createdAt: options.createdAt ?? now,
        expiresAt
    }

    const isNewInstance = !mcpAppInstances.has(options.id)
    mcpAppInstances.set(options.id, instance)
    if (isNewInstance) applicationMetrics.startMcpAppInstance({ publicationId: 'consumer' })
    persistMcpAppInstance(instance)
    return instance
}

/** Refreshes only Redis-backed mutable state while retaining this process's live MCP client. */
export function applyMcpAppInstanceSnapshot(
    instance: McpAppInstance,
    snapshot: McpAppInstanceSnapshot,
    options?: { allowEqualVersion?: boolean }
) {
    if (
        snapshot.appInstanceId !== instance.id ||
        snapshot.toolsetId !== instance.toolset.id ||
        snapshot.serverName !== instance.toolMeta.serverName ||
        snapshot.toolName !== instance.toolMeta.name ||
        snapshot.resourceUri !== instance.toolMeta.ui?.resourceUri ||
        (snapshot.userId !== undefined && instance.userId !== undefined && snapshot.userId !== instance.userId) ||
        snapshot.stateVersion < instance.stateVersion ||
        (snapshot.stateVersion === instance.stateVersion && !options?.allowEqualVersion)
    ) {
        return false
    }
    instance.userId = snapshot.userId ?? instance.userId
    instance.toolCallId = snapshot.toolCallId
    instance.toolInput = isRecord(snapshot.toolInput) ? snapshot.toolInput : {}
    instance.toolResult = normalizeMcpAppToolResult(snapshot.toolResult)
    instance.modelContext = isRecord(snapshot.modelContext)
        ? {
              content: snapshot.modelContext.content,
              structuredContent: isRecord(snapshot.modelContext.structuredContent)
                  ? snapshot.modelContext.structuredContent
                  : undefined,
              updatedAt:
                  typeof snapshot.modelContext.updatedAt === 'number' ? snapshot.modelContext.updatedAt : Date.now()
          }
        : undefined
    instance.messages = snapshot.messages?.slice(-20) ?? []
    instance.logs = snapshot.logs?.slice(-50) ?? []
    instance.stateVersion = snapshot.stateVersion
    instance.createdAt = snapshot.createdAt
    instance.expiresAt = snapshot.expiresAt
    return true
}

export function detachMcpAppInstancesForClient(client: MultiServerMCPClient) {
    let detached = 0
    for (const [id, instance] of mcpAppInstances) {
        if (instance.client === client) {
            deleteMcpAppInstanceRecord(id)
            detached++
        }
    }
    return detached
}

export function getMcpAppInstance(appInstanceId: string): McpAppInstance | null {
    pruneExpiredMcpAppInstances()
    const instance = mcpAppInstances.get(appInstanceId)
    if (!instance || instance.expiresAt <= Date.now()) {
        deleteMcpAppInstanceRecord(appInstanceId)
        if (instance) {
            closeMcpAppInstanceClient(instance)
        }
        return null
    }
    if (!mcpStdioRuntimeManager.isClientRuntimeUsable(instance.client)) {
        deleteMcpAppInstanceRecord(appInstanceId)
        closeMcpAppInstanceClient(instance)
        return null
    }
    return instance
}

export function removeMcpAppInstance(appInstanceId: string) {
    const instance = mcpAppInstances.get(appInstanceId)
    deleteMcpAppInstanceRecord(appInstanceId)
    deletePersistedMcpAppInstance(appInstanceId)
    if (instance) closeMcpAppInstanceClient({ ...instance, closeClientOnExpire: true })
    return Boolean(instance)
}

function deleteMcpAppInstanceRecord(appInstanceId: string) {
    const deleted = mcpAppInstances.delete(appInstanceId)
    if (deleted) applicationMetrics.finishMcpAppInstance({ publicationId: 'consumer' })
    return deleted
}

export function buildMcpAppComponentMessage(data: TMcpAppComponentData) {
    return {
        id: data.toolCallId ?? data.appInstanceId,
        category: 'Dashboard',
        type: 'McpApp',
        title: data.title ?? data.toolName,
        toolset: data.toolsetId,
        toolset_id: data.toolsetId,
        tool: data.toolName,
        status: data.status ?? 'success',
        created_date: new Date().toISOString(),
        data,
        ...data
    }
}

export function normalizeMcpResourceContent(result: ReadResourceResult, expectedUri: string) {
    const content = result.contents?.find((item) => item.uri === expectedUri) ?? result.contents?.[0]
    if (!content) {
        throw new Error(`MCP App resource '${expectedUri}' returned no content`)
    }

    if (content.uri && !content.uri.startsWith('ui://')) {
        throw new Error(`MCP App resource '${content.uri}' must use the ui:// scheme`)
    }

    const mimeType = content.mimeType ?? MCP_APP_RESOURCE_MIME_TYPE
    if (!mimeType.startsWith(MCP_APP_RESOURCE_MIME_TYPE)) {
        throw new Error(`MCP App resource '${expectedUri}' must use ${MCP_APP_RESOURCE_MIME_TYPE}`)
    }

    if (typeof content.text !== 'string' && typeof content.blob !== 'string') {
        throw new Error(`MCP App resource '${expectedUri}' must return text or blob content`)
    }

    const textBytes = typeof content.text === 'string' ? Buffer.byteLength(content.text, 'utf8') : 0
    const blobBytes = typeof content.blob === 'string' ? Buffer.byteLength(content.blob, 'base64') : 0
    if (textBytes + blobBytes > MCP_APP_RESOURCE_MAX_BYTES) {
        throw new Error(`MCP App resource '${expectedUri}' is larger than ${MCP_APP_RESOURCE_MAX_BYTES} bytes`)
    }

    const resourceUi = extractMcpAppResourceUiMeta(content) ?? extractMcpAppResourceUiMeta(result)

    return {
        uri: content.uri ?? expectedUri,
        mimeType,
        text: content.text,
        blob: content.blob,
        title: resourceUi?.title,
        description: resourceUi?.description,
        icon: resourceUi?.icon,
        csp: resourceUi?.csp,
        permissions: resourceUi?.permissions,
        domain: resourceUi?.domain,
        prefersBorder: resourceUi?.prefersBorder
    }
}

async function readListedMcpResourceUiMeta(
    client: MultiServerMCPClient,
    connection: LangChainMcpConnection,
    serverName: string,
    resourceUri: string
): Promise<Partial<Omit<TMcpAppUiMeta, 'resourceUri'>> | undefined> {
    try {
        let cursor: string | undefined
        do {
            const response = connection.usesModernHttp(serverName)
                ? await connection.requestExtension(
                      serverName,
                      { method: 'resources/list', params: cursor ? { cursor } : {} },
                      ListResourcesResultSchema,
                      { routing: { method: 'resources/list' } }
                  )
                : await (
                      await requireLegacyMcpClient(client, serverName)
                  ).listResources(cursor ? { cursor } : undefined)
            const resource = response.resources?.find((item) => item.uri === resourceUri)
            if (resource) {
                return extractMcpAppResourceUiMeta(resource)
            }
            cursor = response.nextCursor
        } while (cursor)
    } catch {
        return undefined
    }
    return undefined
}

async function requireLegacyMcpClient(client: MultiServerMCPClient, serverName: string): Promise<Client> {
    const sdkClient = await client.getClient(serverName)
    if (!sdkClient) throw new Error(`MCP server '${serverName}' is not connected`)
    return sdkClient
}

async function readClientResource(
    client: MultiServerMCPClient,
    connection: LangChainMcpConnection,
    serverName: string,
    uri: string
): Promise<ReadResourceResult> {
    return connection.usesModernHttp(serverName)
        ? connection.requestExtension(
              serverName,
              { method: 'resources/read', params: { uri } },
              ReadResourceResultSchema,
              { routing: { method: 'resources/read', name: uri } }
          )
        : (await requireLegacyMcpClient(client, serverName)).readResource({ uri })
}

export async function readMcpAppResource(instance: McpAppInstance) {
    const resourceUri = instance.toolMeta.ui?.resourceUri
    if (!resourceUri?.startsWith('ui://')) {
        throw new Error('MCP App resource URI must use the ui:// scheme')
    }

    mcpStdioRuntimeManager.touchClient(instance.client)
    const connection = new LangChainMcpConnection(instance.client)
    const result = await readClientResource(instance.client, connection, instance.toolMeta.serverName, resourceUri)
    const resource = normalizeMcpResourceContent(result, resourceUri)
    const listedUi =
        resource.title &&
        resource.description &&
        resource.icon &&
        (resource.csp || resource.permissions || resource.domain || resource.prefersBorder !== undefined)
            ? undefined
            : await readListedMcpResourceUiMeta(instance.client, connection, instance.toolMeta.serverName, resourceUri)
    const resourceUi = {
        title: resource.title ?? listedUi?.title,
        description: resource.description ?? listedUi?.description,
        icon: resource.icon ?? listedUi?.icon,
        csp: resource.csp ?? listedUi?.csp,
        permissions: resource.permissions ?? listedUi?.permissions,
        domain: resource.domain ?? listedUi?.domain,
        prefersBorder: resource.prefersBorder ?? listedUi?.prefersBorder
    }
    const ui = mergeMcpAppUiMeta(resource.uri ?? resourceUri, instance.toolMeta.ui, resourceUi)
    instance.toolMeta = {
        ...instance.toolMeta,
        ui
    }

    return {
        ...resource,
        title: ui.title,
        description: ui.description,
        icon: ui.icon,
        csp: ui.csp,
        permissions: ui.permissions,
        domain: ui.domain,
        prefersBorder: ui.prefersBorder
    }
}

export async function callMcpAppTool(
    instance: McpAppInstance,
    name: string,
    args: unknown
): Promise<McpConsumerCallToolResult> {
    const toolMeta = await getMcpAppToolMetadata(instance, name)
    if (!toolMeta) {
        throw new Error(`MCP App tool '${name}' was not found on this server`)
    }
    if (!toolMeta.visibility.includes('app')) {
        throw new Error(`MCP App tool '${name}' is not visible to apps`)
    }
    if (!resolveToolEnabled(instance.toolset, toolMeta.name, toolMeta.displayName)) {
        throw new Error(`MCP App tool '${name}' is disabled`)
    }

    mcpStdioRuntimeManager.touchClient(instance.client)
    const connection = new LangChainMcpConnection(instance.client)
    return connection.usesModernHttp(instance.toolMeta.serverName)
        ? connection.requestExtension(
              instance.toolMeta.serverName,
              {
                  method: 'tools/call',
                  params: { name: toolMeta.name, arguments: isRecord(args) ? args : {} }
              },
              mcpConsumerCallToolResultSchema,
              { routing: { method: 'tools/call', name: toolMeta.name } }
          )
        : mcpConsumerCallToolResultSchema.parse(
              await (
                  await requireLegacyMcpClient(instance.client, instance.toolMeta.serverName)
              ).callTool({
                  name: toolMeta.name,
                  arguments: isRecord(args) ? args : {}
              })
          )
}

export async function getMcpAppToolMetadata(instance: McpAppInstance, name: string) {
    const toolMetadata = await listMcpToolAppMetadata(instance.client)
    return toolMetadata.find(
        (item) => item.serverName === instance.toolMeta.serverName && (item.name === name || item.displayName === name)
    )
}

export async function listMcpAppVisibleToolMetadata(instance: McpAppInstance) {
    const metadata = await listMcpToolAppMetadata(instance.client)
    return metadata.filter(
        (item) =>
            item.serverName === instance.toolMeta.serverName &&
            item.visibility.includes('app') &&
            resolveToolEnabled(instance.toolset, item.name, item.displayName)
    )
}

export async function readMcpAppServerResource(instance: McpAppInstance, uri: string): Promise<ReadResourceResult> {
    const scheme = uri.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase()
    if (!scheme) {
        throw new Error('MCP App resource reads require an absolute MCP resource URI')
    }
    if (['http', 'https', 'javascript', 'data', 'blob'].includes(scheme)) {
        throw new Error(`MCP App resource reads do not allow the ${scheme}:// scheme`)
    }

    mcpStdioRuntimeManager.touchClient(instance.client)
    const connection = new LangChainMcpConnection(instance.client)
    const result = await readClientResource(instance.client, connection, instance.toolMeta.serverName, uri)
    let totalBytes = 0
    for (const content of result.contents ?? []) {
        totalBytes += typeof content.text === 'string' ? Buffer.byteLength(content.text, 'utf8') : 0
        totalBytes += typeof content.blob === 'string' ? Buffer.byteLength(content.blob, 'base64') : 0
    }
    if (totalBytes > MCP_APP_RESOURCE_MAX_BYTES) {
        throw new Error(`MCP App resource '${uri}' is larger than ${MCP_APP_RESOURCE_MAX_BYTES} bytes`)
    }
    return result
}

export function getInitialMcpAppToolResult(instance: McpAppInstance) {
    return instance.toolResult
}

export function getInitialMcpAppToolInput(instance: McpAppInstance) {
    return instance.toolInput ?? {}
}

export function updateMcpAppModelContext(instance: McpAppInstance, params: unknown) {
    if (!isRecord(params)) {
        throw new Error('ui/update-model-context params must be an object')
    }
    if (params.content !== undefined && !Array.isArray(params.content)) {
        throw new Error('ui/update-model-context params.content must be an array')
    }
    if (params.structuredContent !== undefined && !isRecord(params.structuredContent)) {
        throw new Error('ui/update-model-context params.structuredContent must be an object')
    }

    const content = Array.isArray(params.content)
        ? params.content.map((item, index) => {
              const block = normalizeMcpAppMessageContentBlock(item, index)
              if (block.type !== 'text') {
                  throw new Error('ui/update-model-context only accepts negotiated text content blocks')
              }
              return block
          })
        : undefined
    const structuredContent = isRecord(params.structuredContent) ? params.structuredContent : undefined
    const contextBytes = getSerializedByteSize({ content, structuredContent })
    if (contextBytes > MCP_APP_MESSAGE_MAX_BYTES) {
        throw new Error('ui/update-model-context content exceeds the 25 MiB limit')
    }

    instance.modelContext = {
        content,
        structuredContent,
        updatedAt: Date.now()
    }
    markMcpAppInstanceChanged(instance)
    persistMcpAppInstance(instance)
}

export function appendMcpAppMessage(instance: McpAppInstance, params: unknown) {
    if (!isRecord(params) || params.role !== 'user' || !Array.isArray(params.content)) {
        throw new Error('ui/message params must include role "user" and content blocks')
    }
    if (!params.content.length) {
        throw new Error('ui/message content must not be empty')
    }
    if (params.content.length > MCP_APP_MESSAGE_MAX_CONTENT_BLOCKS) {
        throw new Error(`ui/message accepts at most ${MCP_APP_MESSAGE_MAX_CONTENT_BLOCKS} content blocks`)
    }

    let messageBytes = 0
    const content = params.content.map((item, index) => {
        const block = normalizeMcpAppMessageContentBlock(item, index)
        switch (block.type) {
            case 'text':
                messageBytes += Buffer.byteLength(block.text, 'utf8')
                break
            case 'image':
            case 'audio':
                if (!block.mimeType.toLowerCase().startsWith(`${block.type}/`)) {
                    throw new Error(`ui/message ${block.type} block ${index + 1} has an invalid MIME type`)
                }
                messageBytes += validatedBase64ByteLength(block.data, index)
                break
            case 'resource':
                if (typeof block.resource.text === 'string') {
                    messageBytes += Buffer.byteLength(block.resource.text, 'utf8')
                } else if (typeof block.resource.blob === 'string') {
                    messageBytes += validatedBase64ByteLength(block.resource.blob, index)
                }
                break
            case 'resource_link':
                messageBytes += Buffer.byteLength(JSON.stringify(block), 'utf8')
                break
            default:
                throw new Error(`ui/message content block ${index + 1} uses an unsupported type`)
        }

        if (messageBytes > MCP_APP_MESSAGE_MAX_BYTES) {
            throw new Error('ui/message content exceeds the 25 MiB limit')
        }
        return block
    })

    instance.messages.push({
        ...params,
        content,
        receivedAt: new Date().toISOString(),
        modelContext: instance.modelContext
    })
    instance.messages = instance.messages.slice(-20)
    markMcpAppInstanceChanged(instance)
    persistMcpAppInstance(instance)
}

function validatedBase64ByteLength(value: string, index: number) {
    const data = value.replace(/\s/g, '')
    if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
        throw new Error(`ui/message content block ${index + 1} contains invalid base64 data`)
    }
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
    return (data.length / 4) * 3 - padding
}

function normalizeMcpAppMessageContentBlock(value: unknown, index: number): McpAppMessageContentBlock {
    if (!isRecord(value) || typeof value.type !== 'string') {
        throw new Error(`ui/message content block ${index + 1} is invalid`)
    }

    switch (value.type) {
        case 'text':
            if (typeof value.text !== 'string') {
                throw new Error(`ui/message text block ${index + 1} is invalid`)
            }
            return { ...value, type: 'text', text: value.text }
        case 'image':
        case 'audio':
            if (typeof value.data !== 'string' || typeof value.mimeType !== 'string') {
                throw new Error(`ui/message ${value.type} block ${index + 1} is invalid`)
            }
            return { ...value, type: value.type, data: value.data, mimeType: value.mimeType }
        case 'resource': {
            const resource = value.resource
            if (!isRecord(resource) || typeof resource.uri !== 'string') {
                throw new Error(`ui/message resource block ${index + 1} is invalid`)
            }
            const uri = resource.uri
            if (resource.mimeType !== undefined && typeof resource.mimeType !== 'string') {
                throw new Error(`ui/message resource block ${index + 1} has an invalid MIME type`)
            }
            const mimeType = typeof resource.mimeType === 'string' ? resource.mimeType : undefined
            if (typeof resource.text === 'string' && resource.blob === undefined) {
                return {
                    ...value,
                    type: 'resource',
                    resource: {
                        ...resource,
                        uri,
                        mimeType,
                        text: resource.text
                    }
                }
            }
            if (typeof resource.blob === 'string' && resource.text === undefined) {
                return {
                    ...value,
                    type: 'resource',
                    resource: {
                        ...resource,
                        uri,
                        mimeType,
                        blob: resource.blob
                    }
                }
            }
            throw new Error(`ui/message resource block ${index + 1} must contain either text or blob`)
        }
        case 'resource_link':
            if (typeof value.uri !== 'string') {
                throw new Error(`ui/message resource link block ${index + 1} is invalid`)
            }
            if (
                (value.name !== undefined && typeof value.name !== 'string') ||
                (value.description !== undefined && typeof value.description !== 'string') ||
                (value.mimeType !== undefined && typeof value.mimeType !== 'string') ||
                (value.size !== undefined && typeof value.size !== 'number')
            ) {
                throw new Error(`ui/message resource link block ${index + 1} is invalid`)
            }
            return { ...value, type: 'resource_link', uri: value.uri }
        default:
            throw new Error(`ui/message content block ${index + 1} uses an unsupported type`)
    }
}

export function appendMcpAppLog(instance: McpAppInstance, params: unknown) {
    if (getSerializedByteSize(params) > MCP_APP_LOG_MAX_BYTES) {
        throw new Error(`MCP App log message exceeds the ${MCP_APP_LOG_MAX_BYTES} byte limit`)
    }
    instance.logs.push({
        params,
        receivedAt: new Date().toISOString()
    })
    instance.logs = instance.logs.slice(-50)
    markMcpAppInstanceChanged(instance)
    persistMcpAppInstance(instance)
}

function markMcpAppInstanceChanged(instance: McpAppInstance) {
    instance.stateVersion += 1
}

function persistedMcpAppMessageSummary(value: unknown) {
    if (!isRecord(value)) return persistedValueSummary(value)
    if (value.kind === 'mcp_app_message_summary') return value
    const role = typeof value.role === 'string' ? value.role : undefined
    const receivedAt = typeof value.receivedAt === 'string' ? value.receivedAt : undefined
    const content = Array.isArray(value.content) ? value.content.map(persistedMcpAppContentSummary) : undefined
    return {
        kind: 'mcp_app_message_summary',
        ...(role ? { role } : {}),
        ...(receivedAt ? { receivedAt } : {}),
        ...(content ? { content } : {}),
        digest: persistedValueDigest(value)
    }
}

function persistedMcpAppContentSummary(value: unknown) {
    if (!isRecord(value) || typeof value.type !== 'string') return persistedValueSummary(value)
    switch (value.type) {
        case 'text':
            return {
                type: 'text',
                ...persistedTextSummary(typeof value.text === 'string' ? value.text : '')
            }
        case 'image':
        case 'audio':
            return {
                type: value.type,
                ...(typeof value.mimeType === 'string' ? { mimeType: value.mimeType } : {}),
                ...persistedValueSummary(value.data)
            }
        case 'resource': {
            const resource = value.resource
            if (!isRecord(resource)) return persistedValueSummary(value)
            return {
                type: 'resource',
                resource: {
                    ...(typeof resource.uri === 'string'
                        ? { uri: resource.uri.slice(0, MCP_APP_PERSISTED_TEXT_PREVIEW_LENGTH) }
                        : {}),
                    ...(typeof resource.mimeType === 'string' ? { mimeType: resource.mimeType } : {}),
                    ...(typeof resource.text === 'string'
                        ? { text: persistedTextSummary(resource.text) }
                        : typeof resource.blob === 'string'
                          ? { blob: persistedValueSummary(resource.blob) }
                          : {})
                }
            }
        }
        case 'resource_link':
            return {
                type: 'resource_link',
                ...(typeof value.uri === 'string'
                    ? { uri: value.uri.slice(0, MCP_APP_PERSISTED_TEXT_PREVIEW_LENGTH) }
                    : {}),
                ...(typeof value.name === 'string'
                    ? { name: value.name.slice(0, MCP_APP_PERSISTED_TEXT_PREVIEW_LENGTH) }
                    : {}),
                ...(typeof value.mimeType === 'string' ? { mimeType: value.mimeType } : {}),
                ...(typeof value.size === 'number' ? { size: value.size } : {})
            }
        default:
            return persistedValueSummary(value)
    }
}

function persistedMcpAppLogSummary(value: unknown) {
    if (!isRecord(value)) return persistedValueSummary(value)
    if (value.kind === 'mcp_app_log_summary') return value
    const params = value.params
    const receivedAt = typeof value.receivedAt === 'string' ? value.receivedAt : undefined
    return {
        kind: 'mcp_app_log_summary',
        ...(receivedAt ? { receivedAt } : {}),
        params: persistedValueSummary(params)
    }
}

function persistedTextSummary(value: string) {
    return {
        preview: value.slice(0, MCP_APP_PERSISTED_TEXT_PREVIEW_LENGTH),
        bytes: Buffer.byteLength(value, 'utf8'),
        digest: persistedValueDigest(value)
    }
}

function persistedValueSummary(value: unknown) {
    return {
        bytes: getSerializedByteSize(value),
        digest: persistedValueDigest(value)
    }
}

function persistedValueDigest(value: unknown) {
    try {
        return createHash('sha256')
            .update(JSON.stringify(value) ?? 'null')
            .digest('hex')
    } catch {
        return 'unserializable'
    }
}
