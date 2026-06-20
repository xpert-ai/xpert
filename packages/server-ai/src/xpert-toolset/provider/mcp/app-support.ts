import { DynamicStructuredTool } from '@langchain/core/tools'
import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { Client as McpSdkClient, type Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import {
    IXpertTool,
    IXpertToolset,
    MCP_APP_RESOURCE_MIME_TYPE,
    TMcpAppComponentData,
    TMcpAppCsp,
    TMcpAppPermissions,
    TMcpAppUiMeta,
    TMcpAppVisibility,
    TMcpToolAppMeta,
    isToolEnabled
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { randomUUID } from 'node:crypto'

const MCP_APP_INSTANCE_TTL_MS = 30 * 60 * 1000
const MCP_APP_RESOURCE_MAX_BYTES = 2 * 1024 * 1024
const MCP_APP_UI_EXTENSION_ID = 'io.modelcontextprotocol/ui'
const bridgedMcpAppClients = new WeakSet<MultiServerMCPClient>()
let mcpUiClientCapabilitiesBridgeInstalled = false

type McpToolLike = {
    name: string
    description?: string
    inputSchema?: Record<string, unknown>
    annotations?: Record<string, unknown>
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
    client: MultiServerMCPClient
    destroy?: (() => Promise<void>) | null
    closeClientOnExpire?: boolean
    toolset: Pick<IXpertToolset, 'id' | 'name' | 'tools' | 'options'>
    toolMeta: TMcpToolAppMeta
    toolCallId?: string
    toolInput?: Record<string, unknown>
    toolResult?: unknown
    modelContext?: {
        content?: unknown
        structuredContent?: Record<string, unknown>
        updatedAt: number
    }
    messages: unknown[]
    logs: unknown[]
    createdAt: number
    expiresAt: number
}

const mcpAppInstances = new Map<string, McpAppInstance>()

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }
    const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    return strings.length ? strings : undefined
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

export async function listMcpToolAppMetadata(client: MultiServerMCPClient): Promise<TMcpToolAppMeta[]> {
    const config = client.config
    const serverNames = Object.keys(config.mcpServers ?? {})
    const loadOptions = (client as unknown as McpClientPrivateState)._loadToolsOptions ?? {}
    const metadata: TMcpToolAppMeta[] = []

    for (const serverName of serverNames) {
        const sdkClient = await client.getClient(serverName)
        if (!sdkClient) {
            continue
        }

        for (const tool of await listSdkTools(sdkClient)) {
            const meta = isRecord(tool._meta) ? tool._meta : undefined
            metadata.push({
                serverName,
                name: tool.name,
                displayName: getToolDisplayName(serverName, tool.name, loadOptions[serverName]),
                visibility: extractMcpAppVisibility(meta),
                ui: extractMcpAppUiMeta(meta),
                annotations: tool.annotations,
                _meta: meta
            })
        }
    }

    return metadata
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

function extractToolResultMeta(toolResult: unknown): Record<string, unknown> | undefined {
    if (!Array.isArray(toolResult) || toolResult.length < 2) {
        return undefined
    }
    return readArtifactMeta(toolResult[1])
}

function resolveToolEnabled(toolset: Pick<IXpertToolset, 'tools' | 'options'>, toolName: string, displayName: string) {
    const disableToolDefault = toolset.options?.disableToolDefault
    const config = toolset.tools?.find((tool) => tool.name === displayName || tool.name === toolName)
    if (config) {
        return isToolEnabled(config as IXpertTool, disableToolDefault)
    }
    return Boolean(disableToolDefault)
}

function pruneExpiredMcpAppInstances(now = Date.now()) {
    for (const [id, instance] of mcpAppInstances) {
        if (instance.expiresAt <= now) {
            mcpAppInstances.delete(id)
            if (instance.closeClientOnExpire) {
                instance.destroy?.().catch(() => undefined)
                instance.client.close().catch(() => undefined)
            }
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
    toolset: Pick<IXpertToolset, 'id' | 'name' | 'tools' | 'options'>
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

    const now = Date.now()
    pruneExpiredMcpAppInstances(now)

    const id = randomUUID()
    mcpAppInstances.set(id, {
        id,
        client: options.client,
        destroy: null,
        closeClientOnExpire: false,
        toolset: options.toolset,
        toolMeta: {
            ...toolMeta,
            ui
        },
        toolCallId: options.toolCallId,
        toolInput: isRecord(options.toolInput) ? options.toolInput : {},
        toolResult: options.toolResult,
        messages: [],
        logs: [],
        createdAt: now,
        expiresAt: now + MCP_APP_INSTANCE_TTL_MS
    })

    return {
        type: 'McpApp',
        appInstanceId: id,
        resourceUri: ui.resourceUri,
        toolName: options.tool.name,
        toolCallId: options.toolCallId,
        toolsetId: options.toolset.id,
        serverName: toolMeta.serverName,
        title: options.tool.description || options.tool.name,
        csp: ui.csp,
        permissions: ui.permissions,
        domain: ui.domain,
        prefersBorder: ui.prefersBorder,
        toolInput: isRecord(options.toolInput) ? options.toolInput : {},
        visibility: toolMeta.visibility,
        status: 'success'
    }
}

export function restoreMcpAppInstance(options: {
    id: string
    client: MultiServerMCPClient
    destroy?: (() => Promise<void>) | null
    toolset: Pick<IXpertToolset, 'id' | 'name' | 'tools' | 'options'>
    toolMeta: TMcpToolAppMeta
    toolCallId?: string
    toolInput?: unknown
    toolResult?: unknown
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

    const instance: McpAppInstance = {
        id: options.id,
        client: options.client,
        destroy: options.destroy ?? null,
        closeClientOnExpire: true,
        toolset: options.toolset,
        toolMeta: options.toolMeta,
        toolCallId: options.toolCallId,
        toolInput: isRecord(options.toolInput) ? options.toolInput : {},
        toolResult: options.toolResult,
        messages: [],
        logs: [],
        createdAt: now,
        expiresAt: now + MCP_APP_INSTANCE_TTL_MS
    }

    mcpAppInstances.set(options.id, instance)
    return instance
}

export function getMcpAppInstance(appInstanceId: string): McpAppInstance | null {
    pruneExpiredMcpAppInstances()
    const instance = mcpAppInstances.get(appInstanceId)
    if (!instance || instance.expiresAt <= Date.now()) {
        mcpAppInstances.delete(appInstanceId)
        if (instance?.closeClientOnExpire) {
            instance.destroy?.().catch(() => undefined)
            instance.client.close().catch(() => undefined)
        }
        return null
    }
    return instance
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
        csp: resourceUi?.csp,
        permissions: resourceUi?.permissions,
        domain: resourceUi?.domain,
        prefersBorder: resourceUi?.prefersBorder
    }
}

async function readListedMcpResourceUiMeta(
    sdkClient: Client,
    resourceUri: string
): Promise<Partial<Omit<TMcpAppUiMeta, 'resourceUri'>> | undefined> {
    try {
        let cursor: string | undefined
        do {
            const response = await sdkClient.listResources(cursor ? { cursor } : undefined)
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

export async function readMcpAppResource(instance: McpAppInstance) {
    const sdkClient = await instance.client.getClient(instance.toolMeta.serverName)
    if (!sdkClient) {
        throw new Error(`MCP server '${instance.toolMeta.serverName}' is not connected`)
    }

    const resourceUri = instance.toolMeta.ui?.resourceUri
    if (!resourceUri?.startsWith('ui://')) {
        throw new Error('MCP App resource URI must use the ui:// scheme')
    }

    const result = await sdkClient.readResource({ uri: resourceUri })
    const resource = normalizeMcpResourceContent(result, resourceUri)
    const listedUi =
        resource.csp || resource.permissions || resource.domain || resource.prefersBorder !== undefined
            ? undefined
            : await readListedMcpResourceUiMeta(sdkClient, resourceUri)
    const resourceUi = {
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
        csp: ui.csp,
        permissions: ui.permissions,
        domain: ui.domain,
        prefersBorder: ui.prefersBorder
    }
}

export async function callMcpAppTool(instance: McpAppInstance, name: string, args: unknown): Promise<CallToolResult> {
    const toolMetadata = await listMcpToolAppMetadata(instance.client)
    const toolMeta = toolMetadata.find(
        (item) => item.serverName === instance.toolMeta.serverName && (item.name === name || item.displayName === name)
    )
    if (!toolMeta) {
        throw new Error(`MCP App tool '${name}' was not found on this server`)
    }
    if (!toolMeta.visibility.includes('app')) {
        throw new Error(`MCP App tool '${name}' is not visible to apps`)
    }
    if (!resolveToolEnabled(instance.toolset, toolMeta.name, toolMeta.displayName)) {
        throw new Error(`MCP App tool '${name}' is disabled`)
    }

    const sdkClient = await instance.client.getClient(instance.toolMeta.serverName)
    if (!sdkClient) {
        throw new Error(`MCP server '${instance.toolMeta.serverName}' is not connected`)
    }

    return sdkClient.callTool({
        name: toolMeta.name,
        arguments: isRecord(args) ? args : {}
    })
}

export async function readMcpAppServerResource(instance: McpAppInstance, uri: string): Promise<ReadResourceResult> {
    const scheme = uri.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase()
    if (!scheme) {
        throw new Error('MCP App resource reads require an absolute MCP resource URI')
    }
    if (['http', 'https', 'javascript', 'data', 'blob'].includes(scheme)) {
        throw new Error(`MCP App resource reads do not allow the ${scheme}:// scheme`)
    }

    const sdkClient = await instance.client.getClient(instance.toolMeta.serverName)
    if (!sdkClient) {
        throw new Error(`MCP server '${instance.toolMeta.serverName}' is not connected`)
    }

    const result = await sdkClient.readResource({ uri })
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
    instance.modelContext = {
        content: params.content,
        structuredContent: isRecord(params.structuredContent) ? params.structuredContent : undefined,
        updatedAt: Date.now()
    }
}

export function appendMcpAppMessage(instance: McpAppInstance, params: unknown) {
    if (!isRecord(params) || params.role !== 'user' || !Array.isArray(params.content)) {
        throw new Error('ui/message params must include role "user" and content blocks')
    }
    instance.messages.push({
        ...params,
        receivedAt: new Date().toISOString(),
        modelContext: instance.modelContext
    })
}

export function appendMcpAppLog(instance: McpAppInstance, params: unknown) {
    instance.logs.push({
        params,
        receivedAt: new Date().toISOString()
    })
}
