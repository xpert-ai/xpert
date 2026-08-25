import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleDestroy,
    OnModuleInit
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { TMCPSchema, TMcpToolAppMeta } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { EnvStateQuery } from '../environment'
import {
    appendMcpAppLog,
    appendMcpAppMessage,
    applyMcpAppInstanceSnapshot,
    callMcpAppTool,
    configureMcpAppInstancePersistence,
    getInitialMcpAppToolInput,
    getInitialMcpAppToolResult,
    getMcpAppToolMetadata,
    getMcpAppInstance,
    isMcpAppsEnabled,
    isMcpAppTokenRequired,
    listMcpToolAppMetadata,
    listMcpAppVisibleToolMetadata,
    removeMcpAppInstance,
    readMcpAppResource,
    readMcpAppServerResource,
    refreshMcpAppInstanceToken,
    restoreMcpAppInstance,
    runMcpAppInstanceMutation,
    updateMcpAppModelContext,
    verifyMcpAppInstanceToken,
    waitForMcpAppInstancePersistence
} from './provider/mcp/app-support'
import type { McpAppInstance } from './provider/mcp/app-support'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { createProMCPClient } from './provider/mcp/pro'
import { createMCPClient } from './provider/mcp/types'
import { XpertToolsetService } from './xpert-toolset.service'
import {
    McpAppInstanceSnapshot,
    McpAppAuditService,
    McpAppInstanceStoreService,
    McpAppToolApprovalService
} from '../mcp-app-runtime'
import { LangChainMcpConnection } from '../mcp-consumer/connection/langchain-mcp-connection'
import { McpConsumerPrompts } from '../mcp-consumer/prompts/mcp-consumer-prompts'
import { McpConsumerResources } from '../mcp-consumer/resources/mcp-consumer-resources'

export type McpAppReviveQuery = {
    toolsetId?: string | string[]
    serverName?: string | string[]
    toolName?: string | string[]
    toolCallId?: string | string[]
    resourceUri?: string | string[]
    title?: string | string[]
    token?: string | string[]
    messageId?: string | string[]
}

type NormalizedMcpAppReviveQuery = {
    toolsetId?: string
    serverName?: string
    toolName?: string
    toolCallId?: string
    resourceUri?: string
    title?: string
    token?: string
    messageId?: string
}

export type JsonRpcRequest = {
    jsonrpc?: '2.0'
    id?: string | number | null
    method?: string
    params?: unknown
}

type JsonRpcError = {
    code: number
    message: string
    data?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function readQueryString(value: string | string[] | undefined): string | undefined {
    const item = Array.isArray(value) ? value[0] : value
    return typeof item === 'string' && item.trim() ? item.trim() : undefined
}

function normalizeReviveQuery(query?: McpAppReviveQuery): NormalizedMcpAppReviveQuery {
    return {
        toolsetId: readQueryString(query?.toolsetId),
        serverName: readQueryString(query?.serverName),
        toolName: readQueryString(query?.toolName),
        toolCallId: readQueryString(query?.toolCallId),
        resourceUri: readQueryString(query?.resourceUri),
        title: readQueryString(query?.title),
        token: readQueryString(query?.token),
        messageId: readQueryString(query?.messageId)
    }
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readMcpAppComponentData(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value)) {
        return null
    }
    if (value.type === 'McpApp') {
        return value
    }
    if (isRecord(value.data) && value.data.type === 'McpApp') {
        return value.data
    }
    return null
}

function collectMcpAppComponentData(value: unknown, items: Record<string, unknown>[] = []) {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectMcpAppComponentData(item, items)
        }
        return items
    }

    if (!isRecord(value)) {
        return items
    }

    const data = readMcpAppComponentData(value)
    if (data) {
        items.push(data)
    }

    if (isRecord(value.data)) {
        collectMcpAppComponentData(value.data, items)
    }

    return items
}

function matchesExpectedValue(actual: string | undefined, expected: Array<string | undefined>) {
    const expectedValues = expected.filter((value): value is string => Boolean(value))
    return expectedValues.length === 0 || (Boolean(actual) && expectedValues.includes(actual))
}

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
    return {
        jsonrpc: '2.0',
        id: id ?? null,
        result
    }
}

function jsonRpcError(id: JsonRpcRequest['id'], error: JsonRpcError) {
    return {
        jsonrpc: '2.0',
        id: id ?? null,
        error
    }
}

function reviveQueryFromSnapshot(
    query: NormalizedMcpAppReviveQuery,
    snapshot: McpAppInstanceSnapshot | null
): NormalizedMcpAppReviveQuery {
    if (!snapshot) return query
    return {
        toolsetId: query.toolsetId ?? snapshot.toolsetId,
        serverName: query.serverName ?? snapshot.serverName,
        toolName: query.toolName ?? snapshot.toolName,
        toolCallId: query.toolCallId ?? snapshot.toolCallId,
        resourceUri: query.resourceUri ?? snapshot.resourceUri,
        title: query.title,
        token: query.token,
        messageId: query.messageId
    }
}

function parseJsonRpcRequest(value: unknown): JsonRpcRequest | null {
    if (!isRecord(value)) return null
    const jsonrpc = value.jsonrpc
    const id = value.id
    const method = value.method
    if (jsonrpc !== undefined && jsonrpc !== '2.0') return null
    if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') return null
    if (method !== undefined && typeof method !== 'string') return null
    let normalizedId: string | number | null | undefined
    if (id === null) {
        normalizedId = null
    } else if (typeof id === 'string' || typeof id === 'number') {
        normalizedId = id
    }
    return {
        ...(jsonrpc === '2.0' ? { jsonrpc } : {}),
        ...(normalizedId !== undefined ? { id: normalizedId } : {}),
        ...(typeof method === 'string' ? { method } : {}),
        ...(Reflect.has(value, 'params') ? { params: value.params } : {})
    }
}

@Injectable()
export class McpAppsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(McpAppsService.name)

    constructor(
        private readonly toolsetService: XpertToolsetService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly messageService: ChatMessageService,
        private readonly audit: McpAppAuditService,
        private readonly instanceStore: McpAppInstanceStoreService,
        private readonly approvals: McpAppToolApprovalService
    ) {}

    onModuleInit() {
        configureMcpAppInstancePersistence({
            save: (snapshot) => this.instanceStore.save(snapshot),
            get: (appInstanceId) => this.instanceStore.get(appInstanceId),
            delete: (appInstanceId) => this.instanceStore.delete(appInstanceId),
            onError: (operation, error) =>
                this.logger.error(`Failed to ${operation} MCP App instance state: ${getErrorMessage(error)}`)
        })
    }

    onModuleDestroy() {
        configureMcpAppInstancePersistence(null)
    }

    private assertEnabled() {
        if (!isMcpAppsEnabled()) {
            throw new NotFoundException('MCP Apps are not enabled')
        }
    }

    private async getInstance(
        appInstanceId: string,
        query?: McpAppReviveQuery,
        options?: { allowMessageBootstrap?: boolean }
    ) {
        this.assertEnabled()
        let normalizedQuery = normalizeReviveQuery(query)
        const instance = getMcpAppInstance(appInstanceId)
        if (instance) {
            const snapshot = await this.instanceStore.get(appInstanceId)
            if (snapshot) applyMcpAppInstanceSnapshot(instance, snapshot)
            this.assertInstanceUser(instance.userId)
            await this.assertAccessForInstance(instance, normalizedQuery, options)
            return instance
        }

        const snapshot = await this.instanceStore.get(appInstanceId)
        normalizedQuery = reviveQueryFromSnapshot(normalizedQuery, snapshot)
        const revived = await this.reviveInstance(appInstanceId, normalizedQuery, options, snapshot)
        if (!revived) {
            throw new NotFoundException('MCP App instance was not found or has expired')
        }
        return revived
    }

    private async assertAccessForInstance(
        instance: McpAppInstance,
        query: NormalizedMcpAppReviveQuery,
        options?: { allowMessageBootstrap?: boolean }
    ) {
        try {
            this.assertTokenForInstance(instance, query)
            return
        } catch (error) {
            if (!options?.allowMessageBootstrap) {
                throw error
            }
        }

        await this.assertMessageBootstrap(instance.id, query, instance.toolset, instance.toolMeta)
    }

    private assertTokenForInstance(instance: McpAppInstance, query: NormalizedMcpAppReviveQuery) {
        if (!query.token) {
            if (isMcpAppTokenRequired()) {
                throw new ForbiddenException('MCP App token is required')
            }
            return
        }

        try {
            verifyMcpAppInstanceToken(query.token, {
                appInstanceId: instance.id,
                tenantId: instance.toolset.tenantId,
                organizationId: instance.toolset.organizationId,
                workspaceId: instance.toolset.workspaceId,
                userId: instance.userId,
                toolsetId: instance.toolset.id,
                serverName: instance.toolMeta.serverName,
                toolName: instance.toolMeta.name,
                resourceUri: instance.toolMeta.ui?.resourceUri,
                toolCallId: instance.toolCallId
            })
        } catch (error) {
            throw new ForbiddenException(getErrorMessage(error))
        }
    }

    private assertExpiredTokenForBootstrap(
        appInstanceId: string,
        query: NormalizedMcpAppReviveQuery,
        toolset?: McpAppInstance['toolset'],
        toolMeta?: TMcpToolAppMeta
    ) {
        if (!query.token) {
            return false
        }

        verifyMcpAppInstanceToken(
            query.token,
            {
                appInstanceId,
                tenantId: toolset?.tenantId,
                organizationId: toolset?.organizationId,
                workspaceId: toolset?.workspaceId,
                toolsetId: toolset?.id ?? query.toolsetId,
                serverName: toolMeta?.serverName ?? query.serverName,
                toolName: toolMeta?.name ?? query.toolName,
                resourceUri: toolMeta?.ui?.resourceUri ?? query.resourceUri,
                toolCallId: query.toolCallId
            },
            { ignoreExpiration: true }
        )
        return true
    }

    private async assertMessageBootstrap(
        appInstanceId: string,
        query: NormalizedMcpAppReviveQuery,
        toolset?: McpAppInstance['toolset'],
        toolMeta?: TMcpToolAppMeta
    ) {
        let tokenError: unknown
        try {
            this.assertExpiredTokenForBootstrap(appInstanceId, query, toolset, toolMeta)
        } catch (error) {
            tokenError = error
        }

        if (!query.messageId) {
            if (tokenError) {
                throw new ForbiddenException(getErrorMessage(tokenError))
            }
            if (isMcpAppTokenRequired()) {
                throw new ForbiddenException('MCP App message bootstrap metadata is required')
            }
            return
        }

        const message = await this.messageService.findOne(query.messageId).catch(() => null)
        const components = [
            ...collectMcpAppComponentData(message?.events),
            ...collectMcpAppComponentData(message?.content)
        ]
        const matched = components.some((data) => {
            if (readString(data.appInstanceId) !== appInstanceId) {
                return false
            }

            return (
                matchesExpectedValue(readString(data.toolsetId), [toolset?.id, query.toolsetId]) &&
                matchesExpectedValue(readString(data.serverName), [toolMeta?.serverName, query.serverName]) &&
                matchesExpectedValue(readString(data.resourceUri), [toolMeta?.ui?.resourceUri, query.resourceUri]) &&
                matchesExpectedValue(readString(data.toolCallId), [query.toolCallId]) &&
                matchesExpectedValue(readString(data.toolName), [toolMeta?.name, toolMeta?.displayName, query.toolName])
            )
        })

        if (!matched) {
            throw new ForbiddenException('MCP App message bootstrap metadata was not found')
        }
    }

    private assertReviveToken(
        appInstanceId: string,
        query: NormalizedMcpAppReviveQuery,
        toolset?: McpAppInstance['toolset'],
        toolMeta?: TMcpToolAppMeta,
        userId?: string,
        options?: { allowMessageBootstrap?: boolean }
    ) {
        if (!query.token) {
            if (isMcpAppTokenRequired() && !options?.allowMessageBootstrap) {
                throw new ForbiddenException('MCP App token is required')
            }
            return
        }

        try {
            verifyMcpAppInstanceToken(query.token, {
                appInstanceId,
                tenantId: toolset?.tenantId,
                organizationId: toolset?.organizationId,
                workspaceId: toolset?.workspaceId,
                userId,
                toolsetId: toolset?.id ?? query.toolsetId,
                serverName: toolMeta?.serverName ?? query.serverName,
                toolName: toolMeta?.name ?? query.toolName,
                resourceUri: toolMeta?.ui?.resourceUri ?? query.resourceUri,
                toolCallId: query.toolCallId
            })
        } catch (error) {
            throw new ForbiddenException(getErrorMessage(error))
        }
    }

    private async assertReviveAccess(
        appInstanceId: string,
        query: NormalizedMcpAppReviveQuery,
        toolset?: McpAppInstance['toolset'],
        toolMeta?: TMcpToolAppMeta,
        userId?: string,
        options?: { allowMessageBootstrap?: boolean }
    ) {
        this.assertInstanceUser(userId)
        try {
            this.assertReviveToken(appInstanceId, query, toolset, toolMeta, userId, options)
            if (query.token || !isMcpAppTokenRequired()) {
                return
            }
        } catch (error) {
            if (!options?.allowMessageBootstrap) {
                throw error
            }
        }

        if (!options?.allowMessageBootstrap) {
            return
        }

        await this.assertMessageBootstrap(appInstanceId, query, toolset, toolMeta)
    }

    private assertInstanceUser(userId?: string) {
        if (userId && RequestContext.currentUserId() !== userId) {
            const defaultValue = 'The MCP App instance belongs to another user.'
            throw new ForbiddenException(
                t('server-ai:Error.McpAppUserBindingMismatch', {
                    defaultValue
                }) || defaultValue
            )
        }
    }

    private async reviveInstance(
        appInstanceId: string,
        query: NormalizedMcpAppReviveQuery,
        options?: { allowMessageBootstrap?: boolean },
        snapshot?: McpAppInstanceSnapshot | null
    ) {
        if (!query.toolsetId || !query.resourceUri?.startsWith('ui://')) {
            return null
        }

        const toolset = await this.toolsetService.findOne(query.toolsetId, { relations: ['tools'] })
        if (!toolset?.schema) {
            return null
        }
        await this.assertReviveAccess(appInstanceId, query, toolset, undefined, snapshot?.userId, options)

        const schema = JSON.parse(toolset.schema) as TMCPSchema
        const envState = await this.queryBus.execute(new EnvStateQuery(toolset.workspaceId))
        const { client, destroy } = this.toolsetService.isPro()
            ? await createProMCPClient(toolset, null, this.commandBus, schema, envState)
            : await createMCPClient(toolset, schema, envState, undefined, {
                  appInstanceId,
                  userId: snapshot?.userId
              })
        if (!client) {
            return null
        }

        try {
            const toolMeta = await this.findRevivedToolMeta(client, query)
            if (!toolMeta) {
                await destroy?.()
                await client.close()
                return null
            }
            await this.assertReviveAccess(appInstanceId, query, toolset, toolMeta, snapshot?.userId, options)

            const restored = restoreMcpAppInstance({
                id: appInstanceId,
                client,
                userId: snapshot?.userId,
                destroy,
                toolset,
                toolMeta,
                toolCallId: query.toolCallId,
                toolInput: snapshot?.toolInput,
                toolResult: snapshot?.toolResult,
                modelContext: readModelContext(snapshot?.modelContext),
                messages: snapshot?.messages,
                logs: snapshot?.logs,
                createdAt: snapshot?.createdAt,
                expiresAt: snapshot?.expiresAt,
                stateVersion: snapshot?.stateVersion
            })
            if (!restored) {
                await destroy?.()
                await client.close()
            } else {
                await waitForMcpAppInstancePersistence(appInstanceId)
            }
            return restored
        } catch (error) {
            await destroy?.().catch(() => undefined)
            await client?.close().catch(() => undefined)
            throw error
        }
    }

    private async findRevivedToolMeta(
        client: McpAppInstance['client'],
        query: NormalizedMcpAppReviveQuery
    ): Promise<TMcpToolAppMeta | null> {
        const metadata = await listMcpToolAppMetadata(client)
        const matchesServer = (item: TMcpToolAppMeta) => !query.serverName || item.serverName === query.serverName
        const matchesTool = (item: TMcpToolAppMeta) =>
            !query.toolName || item.name === query.toolName || item.displayName === query.toolName
        const matchesResource = (item: TMcpToolAppMeta) => item.ui?.resourceUri === query.resourceUri
        const isAppVisible = (item: TMcpToolAppMeta) => item.visibility.includes('app')

        const toolMeta =
            metadata.find(
                (item) => matchesServer(item) && matchesTool(item) && matchesResource(item) && isAppVisible(item)
            ) ??
            metadata.find((item) => matchesServer(item) && matchesResource(item) && isAppVisible(item)) ??
            metadata.find((item) => matchesServer(item) && matchesTool(item) && isAppVisible(item))

        if (!toolMeta) {
            return null
        }

        return {
            ...toolMeta,
            ui: {
                ...(toolMeta.ui ?? {}),
                resourceUri: query.resourceUri
            }
        }
    }

    async getResource(appInstanceId: string, query?: McpAppReviveQuery) {
        const instance = await this.getInstance(appInstanceId, query, { allowMessageBootstrap: true })
        const resource = await readMcpAppResource(instance)
        const appInstanceToken = await runMcpAppInstanceMutation(appInstanceId, async () => {
            const token = refreshMcpAppInstanceToken(instance)
            await waitForMcpAppInstancePersistence(appInstanceId)
            return token
        })

        return {
            ...resource,
            appInstanceToken,
            resourceUri: resource.uri ?? instance.toolMeta.ui?.resourceUri,
            csp: resource.csp,
            permissions: resource.permissions,
            domain: resource.domain,
            prefersBorder: resource.prefersBorder,
            toolInfo: {
                name: instance.toolMeta.displayName,
                originalName: instance.toolMeta.name,
                inputSchema: instance.toolMeta.inputSchema ?? { type: 'object', properties: {} },
                title: resource.title ?? instance.toolMeta.ui?.title,
                description: resource.description ?? instance.toolMeta.ui?.description,
                icon: resource.icon ?? instance.toolMeta.ui?.icon,
                serverName: instance.toolMeta.serverName,
                toolCallId: instance.toolCallId,
                toolsetId: instance.toolset.id
            },
            toolInput: getInitialMcpAppToolInput(instance),
            toolResult: getInitialMcpAppToolResult(instance)
        }
    }

    async handleRpc(appInstanceId: string, value: unknown, query?: McpAppReviveQuery) {
        const request = parseJsonRpcRequest(value)
        if (!request) {
            return jsonRpcError(null, { code: -32600, message: 'Invalid JSON-RPC request' })
        }
        const instance = await this.getInstance(appInstanceId, query)
        const id = request?.id ?? null
        const method = request?.method

        if (!method) {
            return jsonRpcError(id, {
                code: -32600,
                message: 'Invalid JSON-RPC request'
            })
        }

        let toolName = readRequestedToolName(request.params)
        let risk: ReturnType<McpAppToolApprovalService['risk']> | undefined
        let approvalId = readApprovalIdFromUnknown(request.params)
        const startedAt = Date.now()
        const audit = await this.audit.start({
            instance,
            method,
            params: request.params,
            toolName,
            approvalId
        })

        try {
            const response = await (async () => {
                switch (method) {
                    case 'ping':
                        return jsonRpcResult(id, {})
                    case 'tools/call': {
                        if (!isRecord(request.params)) {
                            throw new BadRequestException('tools/call params must be an object')
                        }
                        const name = typeof request.params.name === 'string' ? request.params.name : null
                        if (!name) {
                            throw new BadRequestException('tools/call params.name is required')
                        }
                        const arguments_ = request.params.arguments ?? request.params.input ?? {}
                        const toolMeta = await getMcpAppToolMetadata(instance, name)
                        if (!toolMeta || !toolMeta.visibility.includes('app')) {
                            throw new NotFoundException(`MCP App tool '${name}' was not found`)
                        }
                        toolName = toolMeta.name
                        risk = this.approvals.risk(toolMeta.annotations)
                        if (risk !== 'read') {
                            approvalId = readApprovalId(request.params)
                            if (!approvalId) {
                                const approval = await this.approvals.request({
                                    appInstanceId,
                                    tenantId: instance.toolset.tenantId,
                                    workspaceId: instance.toolset.workspaceId,
                                    toolName: toolMeta.name,
                                    arguments: arguments_,
                                    risk
                                })
                                return jsonRpcError(id, {
                                    code: -32001,
                                    message: 'MCP App tool call requires user approval',
                                    data: approval
                                })
                            }
                            await this.approvals.consume({
                                approvalId,
                                appInstanceId,
                                toolName: toolMeta.name,
                                arguments: arguments_
                            })
                        }
                        return jsonRpcResult(id, await callMcpAppTool(instance, name, arguments_))
                    }
                    case 'tools/list':
                        return jsonRpcResult(id, { tools: await listMcpAppVisibleToolMetadata(instance) })
                    case 'resources/list':
                        return jsonRpcResult(id, await this.listServerItems(instance, 'resources'))
                    case 'resources/templates/list':
                        return jsonRpcResult(id, await this.listServerItems(instance, 'resourceTemplates'))
                    case 'prompts/list':
                        return jsonRpcResult(id, await this.listServerItems(instance, 'prompts'))
                    case 'resources/read': {
                        if (!isRecord(request.params) || typeof request.params.uri !== 'string') {
                            throw new BadRequestException('resources/read params.uri is required')
                        }
                        return jsonRpcResult(id, await readMcpAppServerResource(instance, request.params.uri))
                    }
                    case 'ui/open-link': {
                        if (!isRecord(request.params) || typeof request.params.url !== 'string') {
                            throw new BadRequestException('ui/open-link params.url is required')
                        }
                        if (!isHttpUrl(request.params.url)) {
                            throw new BadRequestException('ui/open-link only allows http or https URLs')
                        }
                        return jsonRpcResult(id, {})
                    }
                    case 'ui/message': {
                        await runMcpAppInstanceMutation(appInstanceId, async () => {
                            appendMcpAppMessage(instance, request.params)
                            await waitForMcpAppInstancePersistence(appInstanceId)
                        })
                        return jsonRpcResult(id, {})
                    }
                    case 'ui/update-model-context': {
                        await runMcpAppInstanceMutation(appInstanceId, async () => {
                            updateMcpAppModelContext(instance, request.params)
                            await waitForMcpAppInstancePersistence(appInstanceId)
                        })
                        return jsonRpcResult(id, {})
                    }
                    case 'ui/request-display-mode':
                        return jsonRpcResult(id, { mode: requestedDisplayMode(request.params) })
                    case 'ui/download-file': {
                        validateMcpAppDownloadRequest(request.params)
                        const download = mcpAppDownloadApprovalArguments(request.params)
                        toolName = 'ui/download-file'
                        risk = 'write'
                        approvalId = isRecord(request.params) ? readApprovalId(request.params) : undefined
                        if (!approvalId) {
                            const approval = await this.approvals.request({
                                appInstanceId,
                                tenantId: instance.toolset.tenantId,
                                workspaceId: instance.toolset.workspaceId,
                                toolName,
                                arguments: download,
                                risk
                            })
                            return jsonRpcError(id, {
                                code: -32001,
                                message: 'MCP App file download requires user confirmation',
                                data: approval
                            })
                        }
                        await this.approvals.consume({
                            approvalId,
                            appInstanceId,
                            toolName,
                            arguments: download
                        })
                        return jsonRpcResult(id, {})
                    }
                    case 'ui/resource-teardown':
                        await runMcpAppInstanceMutation(appInstanceId, async () => {
                            removeMcpAppInstance(appInstanceId)
                            await waitForMcpAppInstancePersistence(appInstanceId)
                            await this.instanceStore.delete(appInstanceId)
                        })
                        return jsonRpcResult(id, {})
                    case 'ui/host-context-changed':
                        await runMcpAppInstanceMutation(appInstanceId, async () => {
                            updateMcpAppModelContext(instance, request.params)
                            await waitForMcpAppInstancePersistence(appInstanceId)
                        })
                        return jsonRpcResult(id, {})
                    case 'notifications/message':
                        await runMcpAppInstanceMutation(appInstanceId, async () => {
                            appendMcpAppLog(instance, request.params)
                            await waitForMcpAppInstancePersistence(appInstanceId)
                        })
                        return jsonRpcResult(id, {})
                    default:
                        if (method.startsWith('ui/notifications/')) {
                            return jsonRpcResult(id, {})
                        }
                        return jsonRpcError(id, {
                            code: -32601,
                            message: `Unsupported MCP App method '${method}'`
                        })
                }
            })()

            const rpcErrorCode = readJsonRpcErrorCode(response)
            await this.audit.finish(
                audit,
                startedAt,
                rpcErrorCode === -32001 ? 'approval_required' : rpcErrorCode ? 'failed' : 'succeeded',
                {
                    toolName,
                    risk,
                    approvalId,
                    ...(rpcErrorCode ? { error: { code: rpcErrorCode } } : {})
                }
            )
            return response
        } catch (error) {
            await this.audit.finish(audit, startedAt, 'failed', { error, toolName, risk, approvalId })
            return jsonRpcError(id, {
                code: -32000,
                message: getErrorMessage(error)
            })
        }
    }

    async approve(appInstanceId: string, approvalId: string, query?: McpAppReviveQuery) {
        const instance = await this.getInstance(appInstanceId, query)
        const startedAt = Date.now()
        const audit = await this.audit.start({ instance, method: 'ui/approve-tool', approvalId })
        try {
            const result = await this.approvals.approve(appInstanceId, approvalId)
            await this.audit.finish(audit, startedAt, 'approved', {
                toolName: result.toolName,
                risk: result.risk,
                approvalId
            })
            return result
        } catch (error) {
            await this.audit.finish(audit, startedAt, 'failed', { error, approvalId })
            throw error
        }
    }

    async reject(appInstanceId: string, approvalId: string, query?: McpAppReviveQuery) {
        const instance = await this.getInstance(appInstanceId, query)
        const startedAt = Date.now()
        const audit = await this.audit.start({ instance, method: 'ui/reject-tool', approvalId })
        try {
            const result = await this.approvals.reject(appInstanceId, approvalId)
            await this.audit.finish(audit, startedAt, 'rejected', {
                toolName: result.toolName,
                risk: result.risk,
                approvalId
            })
            return result
        } catch (error) {
            await this.audit.finish(audit, startedAt, 'failed', { error, approvalId })
            throw error
        }
    }

    async teardown(appInstanceId: string, query?: McpAppReviveQuery) {
        const instance = await this.getInstance(appInstanceId, query)
        const startedAt = Date.now()
        const audit = await this.audit.start({ instance, method: 'ui/resource-teardown' })
        try {
            await runMcpAppInstanceMutation(appInstanceId, async () => {
                removeMcpAppInstance(appInstanceId)
                await waitForMcpAppInstancePersistence(appInstanceId)
                await this.instanceStore.delete(appInstanceId)
            })
            await this.audit.finish(audit, startedAt, 'succeeded')
            return { removed: true }
        } catch (error) {
            await this.audit.finish(audit, startedAt, 'failed', { error })
            throw error
        }
    }

    private async listServerItems(instance: McpAppInstance, type: 'resources' | 'resourceTemplates' | 'prompts') {
        const connection = new LangChainMcpConnection(instance.client)
        const resources = new McpConsumerResources(connection)
        const prompts = new McpConsumerPrompts(connection)
        const serverName = instance.toolMeta.serverName
        const items =
            type === 'resources'
                ? await resources.list(serverName)
                : type === 'resourceTemplates'
                  ? await resources.listTemplates(serverName)
                  : await prompts.list(serverName)
        return { [type]: items }
    }
}

function readApprovalId(params: object) {
    const direct = Reflect.get(params, 'approvalId')
    if (typeof direct === 'string' && direct) return direct
    const meta = Reflect.get(params, '_meta')
    const value = typeof meta === 'object' && meta !== null ? Reflect.get(meta, 'approvalId') : undefined
    return typeof value === 'string' && value ? value : undefined
}

function readApprovalIdFromUnknown(value: unknown) {
    return isRecord(value) ? readApprovalId(value) : undefined
}

function readRequestedToolName(value: unknown) {
    if (!isRecord(value)) return undefined
    return typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined
}

function readJsonRpcErrorCode(value: unknown) {
    if (!isRecord(value) || !isRecord(value.error)) return undefined
    return typeof value.error.code === 'number' ? value.error.code : undefined
}

const MCP_APP_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024

function validateMcpAppDownloadRequest(value: unknown) {
    if (!isRecord(value) || !Array.isArray(value.contents) || value.contents.length === 0) {
        throw new BadRequestException('ui/download-file params.contents must be a non-empty array')
    }
    if (value.contents.length > 20) {
        throw new BadRequestException('ui/download-file accepts at most 20 content items')
    }
    if (value.isError !== undefined && typeof value.isError !== 'boolean') {
        throw new BadRequestException('ui/download-file params.isError must be a boolean')
    }

    let totalBytes = 0
    for (const item of value.contents) {
        if (!isRecord(item)) throw new BadRequestException('ui/download-file content item is invalid')
        if (item.type === 'resource') {
            if (!isRecord(item.resource) || typeof item.resource.uri !== 'string') {
                throw new BadRequestException('ui/download-file embedded resource is invalid')
            }
            const text = item.resource.text
            const blob = item.resource.blob
            if (typeof text === 'string') totalBytes += Buffer.byteLength(text, 'utf8')
            else if (typeof blob === 'string') totalBytes += Buffer.byteLength(blob, 'base64')
            else throw new BadRequestException('ui/download-file embedded resource must contain text or blob')
        } else if (item.type === 'resource_link') {
            if (typeof item.uri !== 'string' || typeof item.name !== 'string' || !isHttpUrl(item.uri)) {
                throw new BadRequestException(
                    'ui/download-file resource link must use http or https and include a name'
                )
            }
        } else {
            throw new BadRequestException('ui/download-file content type is unsupported')
        }
    }
    if (totalBytes > MCP_APP_DOWNLOAD_MAX_BYTES) {
        throw new BadRequestException('ui/download-file content exceeds the 20 MiB limit')
    }
}

function mcpAppDownloadApprovalArguments(value: unknown) {
    if (!isRecord(value) || !Array.isArray(value.contents)) return value
    return {
        contents: value.contents,
        ...(typeof value.isError === 'boolean' ? { isError: value.isError } : {})
    }
}

function isHttpUrl(value: string) {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

function requestedDisplayMode(params: unknown) {
    if (!isRecord(params)) return 'inline'
    const mode = params.mode
    if (mode === 'picture-in-picture') return 'pip'
    return mode === 'fullscreen' || mode === 'pip' ? mode : 'inline'
}

function readModelContext(value: unknown): McpAppInstance['modelContext'] | undefined {
    if (!isRecord(value)) return undefined
    const updatedAt = value.updatedAt
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return undefined
    return {
        content: value.content,
        structuredContent: isRecord(value.structuredContent) ? value.structuredContent : undefined,
        updatedAt
    }
}
