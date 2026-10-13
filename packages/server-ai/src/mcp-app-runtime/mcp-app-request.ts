import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

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

export type NormalizedMcpAppReviveQuery = {
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

export type JsonRpcError = {
    code: number
    message: string
    data?: unknown
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

export function readQueryString(value: string | string[] | undefined): string | undefined {
    const item = Array.isArray(value) ? value[0] : value
    return typeof item === 'string' && item.trim() ? item.trim() : undefined
}

export function normalizeReviveQuery(query?: McpAppReviveQuery): NormalizedMcpAppReviveQuery {
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

export function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
    return {
        jsonrpc: '2.0',
        id: id ?? null,
        result
    }
}

export function jsonRpcError(id: JsonRpcRequest['id'], error: JsonRpcError) {
    return {
        jsonrpc: '2.0',
        id: id ?? null,
        error
    }
}

export function reviveQueryFromSnapshot(
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

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest | null {
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
