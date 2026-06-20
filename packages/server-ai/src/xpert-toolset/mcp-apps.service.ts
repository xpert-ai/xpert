import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { TMCPSchema, TMcpToolAppMeta } from '@xpert-ai/contracts'
import { EnvStateQuery } from '../environment'
import {
    appendMcpAppLog,
    appendMcpAppMessage,
    callMcpAppTool,
    getInitialMcpAppToolInput,
    getInitialMcpAppToolResult,
    getMcpAppInstance,
    isMcpAppsEnabled,
    isMcpAppTokenRequired,
    listMcpToolAppMetadata,
    readMcpAppResource,
    readMcpAppServerResource,
    restoreMcpAppInstance,
    updateMcpAppModelContext,
    verifyMcpAppInstanceToken
} from './provider/mcp/app-support'
import type { McpAppInstance } from './provider/mcp/app-support'
import { createProMCPClient } from './provider/mcp/pro'
import { createMCPClient } from './provider/mcp/types'
import { XpertToolsetService } from './xpert-toolset.service'

export type McpAppReviveQuery = {
    toolsetId?: string | string[]
    serverName?: string | string[]
    toolName?: string | string[]
    toolCallId?: string | string[]
    resourceUri?: string | string[]
    title?: string | string[]
    token?: string | string[]
}

type NormalizedMcpAppReviveQuery = {
    toolsetId?: string
    serverName?: string
    toolName?: string
    toolCallId?: string
    resourceUri?: string
    title?: string
    token?: string
}

type JsonRpcRequest = {
    jsonrpc?: '2.0'
    id?: string | number | null
    method?: string
    params?: unknown
}

type JsonRpcError = {
    code: number
    message: string
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
        token: readQueryString(query?.token)
    }
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

@Injectable()
export class McpAppsService {
    constructor(
        private readonly toolsetService: XpertToolsetService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    private assertEnabled() {
        if (!isMcpAppsEnabled()) {
            throw new NotFoundException('MCP Apps are not enabled')
        }
    }

    private async getInstance(appInstanceId: string, query?: McpAppReviveQuery) {
        this.assertEnabled()
        const normalizedQuery = normalizeReviveQuery(query)
        const instance = getMcpAppInstance(appInstanceId)
        if (instance) {
            this.assertTokenForInstance(instance, normalizedQuery)
            return instance
        }

        const revived = await this.reviveInstance(appInstanceId, normalizedQuery)
        if (!revived) {
            throw new NotFoundException('MCP App instance was not found or has expired')
        }
        return revived
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

    private assertReviveToken(
        appInstanceId: string,
        query: NormalizedMcpAppReviveQuery,
        toolset?: McpAppInstance['toolset'],
        toolMeta?: TMcpToolAppMeta
    ) {
        if (!query.token) {
            if (isMcpAppTokenRequired()) {
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

    private async reviveInstance(appInstanceId: string, query: NormalizedMcpAppReviveQuery) {
        if (!query.toolsetId || !query.resourceUri?.startsWith('ui://')) {
            return null
        }

        const toolset = await this.toolsetService.findOne(query.toolsetId, { relations: ['tools'] })
        if (!toolset?.schema) {
            return null
        }
        this.assertReviveToken(appInstanceId, query, toolset)

        const schema = JSON.parse(toolset.schema) as TMCPSchema
        const envState = await this.queryBus.execute(new EnvStateQuery(toolset.workspaceId))
        const { client, destroy } = this.toolsetService.isPro()
            ? await createProMCPClient(toolset, null, this.commandBus, schema, envState)
            : await createMCPClient(toolset, schema, envState, undefined, { appInstanceId })
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
            this.assertReviveToken(appInstanceId, query, toolset, toolMeta)

            const restored = restoreMcpAppInstance({
                id: appInstanceId,
                client,
                destroy,
                toolset,
                toolMeta,
                toolCallId: query.toolCallId
            })
            if (!restored) {
                await destroy?.()
                await client.close()
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
        const instance = await this.getInstance(appInstanceId, query)
        const resource = await readMcpAppResource(instance)

        return {
            ...resource,
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

    async handleRpc(appInstanceId: string, request: JsonRpcRequest, query?: McpAppReviveQuery) {
        const instance = await this.getInstance(appInstanceId, query)
        const id = request?.id ?? null
        const method = request?.method

        if (!method) {
            return jsonRpcError(id, {
                code: -32600,
                message: 'Invalid JSON-RPC request'
            })
        }

        try {
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
                    return jsonRpcResult(
                        id,
                        await callMcpAppTool(instance, name, request.params.arguments ?? request.params.input ?? {})
                    )
                }
                case 'resources/read': {
                    if (!isRecord(request.params) || typeof request.params.uri !== 'string') {
                        throw new BadRequestException('resources/read params.uri is required')
                    }
                    return jsonRpcResult(id, await readMcpAppServerResource(instance, request.params.uri))
                }
                case 'ui/message': {
                    appendMcpAppMessage(instance, request.params)
                    return jsonRpcResult(id, {})
                }
                case 'ui/update-model-context': {
                    updateMcpAppModelContext(instance, request.params)
                    return jsonRpcResult(id, {})
                }
                case 'ui/request-display-mode':
                    return jsonRpcResult(id, { mode: 'inline' })
                case 'notifications/message':
                    appendMcpAppLog(instance, request.params)
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
        } catch (error) {
            return jsonRpcError(id, {
                code: -32000,
                message: getErrorMessage(error)
            })
        }
    }
}
