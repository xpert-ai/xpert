import type { JSONValue, McpTaskStatus, McpPrincipal } from '@xpert-ai/contracts'
import type { CallToolResult } from '@modelcontextprotocol/server'
import type { XpertToolContent, XpertToolResult } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import { McpTask } from './entities'
import { assertMcpAppToolResult } from './mcp-app-tool-result'
import { parseMcpRuntimeConfiguration } from './mcp-runtime-configuration'
import { McpTaskProtocolError, McpCreateTaskResult, McpDetailedTask, McpTaskJobPayload } from './mcp-task.types'
export const MAX_TASK_LIFETIME_MS = 24 * 60 * 60 * 1000
export const DEFAULT_TASK_LIFETIME_MS = 60 * 60 * 1000
export const MAX_TASK_PAYLOAD_BYTES = 2 * 1024 * 1024
export function toCreateTaskResult(task: McpTask): McpCreateTaskResult {
    const createdAt = task.createdAt ?? new Date()
    const updatedAt = task.updatedAt ?? createdAt
    return {
        content: [],
        resultType: 'task',
        taskId: task.taskId,
        status: task.status,
        ...(task.statusMessage ? { statusMessage: task.statusMessage } : {}),
        createdAt: createdAt.toISOString(),
        lastUpdatedAt: updatedAt.toISOString(),
        ttlMs: Math.max(0, task.expiresAt.getTime() - createdAt.getTime()),
        ...(task.pollIntervalMs ? { pollIntervalMs: task.pollIntervalMs } : {})
    }
}

export function toDetailedTask(task: McpTask): McpDetailedTask {
    const createdAt = task.createdAt ?? new Date()
    const updatedAt = task.updatedAt ?? createdAt
    return {
        resultType: 'complete',
        taskId: task.taskId,
        status: task.status,
        ...(task.statusMessage ? { statusMessage: task.statusMessage } : {}),
        createdAt: createdAt.toISOString(),
        lastUpdatedAt: updatedAt.toISOString(),
        ttlMs: Math.max(0, task.expiresAt.getTime() - createdAt.getTime()),
        ...(task.pollIntervalMs ? { pollIntervalMs: task.pollIntervalMs } : {}),
        ...(task.status === 'input_required' && task.inputRequests ? { inputRequests: task.inputRequests } : {}),
        ...(task.status === 'completed' && task.resultRef ? { result: task.resultRef } : {}),
        ...(task.status === 'failed' && task.error ? { error: toTaskProtocolError(task.error) } : {})
    }
}

export function toTaskProtocolError(error: { code?: string; message: string }): JSONValue {
    return {
        code: -32603,
        message: error.message,
        ...(error.code ? { data: { internalCode: error.code } } : {})
    }
}

export function toMcpCallToolResult(result: XpertToolResult, appResourceUri?: string): CallToolResult {
    assertMcpAppToolResult(result, Boolean(appResourceUri))
    const content = (result.content ?? []).flatMap(toMcpContent)
    const structuredContent = jsonObjectOrUndefined(result.structuredContent)
    const meta =
        result.meta || appResourceUri
            ? {
                  ...(result.meta ?? {}),
                  ...(appResourceUri ? { ui: { resourceUri: appResourceUri } } : {})
              }
            : undefined
    return {
        content: content.length
            ? content
            : [{ type: 'text', text: structuredContent ? JSON.stringify(structuredContent) : '' }],
        ...(structuredContent ? { structuredContent } : {}),
        ...(meta ? { _meta: meta } : {}),
        ...(result.isError !== undefined ? { isError: result.isError } : {})
    }
}

export function toMcpContent(content: XpertToolContent): CallToolResult['content'] {
    switch (content.type) {
        case 'text':
            return [{ type: 'text', text: content.text }]
        case 'image':
            return [{ type: 'image', data: content.data, mimeType: content.mimeType }]
        case 'audio':
            return [{ type: 'audio', data: content.data, mimeType: content.mimeType }]
        case 'resource_link':
            assertAllowedResourceUri(content.uri)
            return [{ type: 'resource_link', uri: content.uri, name: content.name ?? content.uri }]
    }
}

export function parseTaskPayload(value: unknown): McpTaskJobPayload | null {
    if (!isObject(value) || Reflect.get(value, 'version') !== 1) return null
    const principal = Reflect.get(value, 'principal')
    const arguments_ = Reflect.get(value, 'arguments')
    if (!isObject(principal) || !isJsonValue(arguments_)) return null
    const principalType = Reflect.get(principal, 'type')
    const principalId = Reflect.get(principal, 'id')
    const userId = Reflect.get(principal, 'userId')
    const clientId = Reflect.get(principal, 'clientId')
    if (
        (principalType !== 'user' && principalType !== 'service_account') ||
        typeof principalId !== 'string' ||
        (userId !== undefined && typeof userId !== 'string') ||
        (clientId !== undefined && typeof clientId !== 'string')
    ) {
        return null
    }
    const required = ['taskId', 'publicationId', 'capabilityId', 'tenantId', 'toolsetId', 'capabilityKey'] as const
    if (required.some((key) => typeof Reflect.get(value, key) !== 'string')) return null
    const organizationId = Reflect.get(value, 'organizationId')
    const serverName = Reflect.get(value, 'serverName')
    const remoteName = Reflect.get(value, 'remoteName')
    const remoteTaskMode = Reflect.get(value, 'remoteTaskMode')
    const traceId = Reflect.get(value, 'traceId')
    const appResourceUri = Reflect.get(value, 'appResourceUri')
    const approvalGranted = Reflect.get(value, 'approvalGranted')
    if (
        (organizationId !== undefined && organizationId !== null && typeof organizationId !== 'string') ||
        (serverName !== undefined && typeof serverName !== 'string') ||
        (remoteName !== undefined && typeof remoteName !== 'string') ||
        (remoteTaskMode !== undefined && remoteTaskMode !== 'optional' && remoteTaskMode !== 'required') ||
        (traceId !== undefined && typeof traceId !== 'string') ||
        (appResourceUri !== undefined && typeof appResourceUri !== 'string') ||
        (approvalGranted !== undefined && typeof approvalGranted !== 'boolean')
    ) {
        return null
    }
    return {
        version: 1,
        ...(typeof Reflect.get(value, 'generation') === 'string'
            ? { generation: Reflect.get(value, 'generation') }
            : {}),
        approvalGranted: approvalGranted === true,
        runtime: parseMcpRuntimeConfiguration(Reflect.get(value, 'runtime')),
        taskId: Reflect.get(value, 'taskId'),
        publicationId: Reflect.get(value, 'publicationId'),
        capabilityId: Reflect.get(value, 'capabilityId'),
        tenantId: Reflect.get(value, 'tenantId'),
        organizationId: typeof organizationId === 'string' ? organizationId : null,
        toolsetId: Reflect.get(value, 'toolsetId'),
        capabilityKey: Reflect.get(value, 'capabilityKey'),
        ...(typeof serverName === 'string' ? { serverName } : {}),
        ...(typeof remoteName === 'string' ? { remoteName } : {}),
        ...(remoteTaskMode === 'optional' || remoteTaskMode === 'required' ? { remoteTaskMode } : {}),
        arguments: arguments_,
        principal: {
            type: principalType,
            id: principalId,
            ...(typeof userId === 'string' ? { userId } : {}),
            ...(typeof clientId === 'string' ? { clientId } : {})
        },
        ...(typeof traceId === 'string' ? { traceId } : {}),
        ...(typeof appResourceUri === 'string' ? { appResourceUri } : {})
    }
}

export function assertAllowedResourceUri(uri: string) {
    const parsed = new URL(uri)
    if (['file:', 'javascript:', 'data:'].includes(parsed.protocol)) {
        throw new Error(`MCP Resource URI scheme '${parsed.protocol}' is not allowed`)
    }
    const decodedPath = decodeURIComponent(parsed.pathname)
    if (decodedPath.split('/').includes('..')) {
        throw new Error('MCP Resource URI contains directory traversal')
    }
}

export function requireJsonValue(value: unknown): JSONValue {
    const normalized = normalizeJsonValue(value, 0)
    if (normalized === undefined) throw invalidTaskParams()
    return normalized
}

export function normalizeJsonValue(value: unknown, depth: number): JSONValue | undefined {
    if (depth > 50) return undefined
    if (value === null) return null
    if (typeof value === 'string') return value
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (Array.isArray(value)) {
        const items: JSONValue[] = []
        for (const item of value) {
            const normalized = normalizeJsonValue(item, depth + 1)
            if (normalized === undefined) return undefined
            items.push(normalized)
        }
        return items
    }
    if (!isObject(value)) return undefined
    const result: Record<string, JSONValue> = {}
    for (const key of Object.keys(value)) {
        const normalized = normalizeJsonValue(Reflect.get(value, key), depth + 1)
        if (normalized !== undefined) result[key] = normalized
    }
    return result
}

export function isJsonValue(value: unknown): value is JSONValue {
    return normalizeJsonValue(value, 0) !== undefined
}

export function jsonObject(value: unknown): Record<string, JSONValue> | null {
    if (!isObject(value)) return null
    const normalized = normalizeJsonValue(value, 0)
    return normalized && !Array.isArray(normalized) && typeof normalized === 'object' ? normalized : null
}

export function jsonObjectOrUndefined(value: unknown): Record<string, unknown> | undefined {
    const normalized = normalizeJsonValue(value, 0)
    return normalized && !Array.isArray(normalized) && typeof normalized === 'object'
        ? Object.fromEntries(Object.entries(normalized))
        : undefined
}

export function isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hashJson(value: JSONValue) {
    return hashText(canonicalJson(value))
}

export function canonicalJson(value: JSONValue): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
            .join(',')}}`
    }
    return JSON.stringify(value)
}

export function hashText(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

export function assertJsonSize(value: JSONValue, maxBytes: number) {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) throw invalidTaskParams()
}

export function clampLifetime(value?: number) {
    if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_TASK_LIFETIME_MS
    return Math.min(Math.max(Math.trunc(value), 60_000), MAX_TASK_LIFETIME_MS)
}

export function clampProgress(value: number) {
    if (!Number.isFinite(value)) throw new Error('MCP task progress must be a finite number')
    return Math.min(Math.max(value, 0), 1)
}

export function isTerminal(status: McpTaskStatus) {
    return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function abortTaskController(controller: AbortController) {
    if (!controller.signal.aborted) controller.abort(new Error('MCP task execution was cancelled'))
}

export function hasTaskScope(principal: McpPrincipal, toolName: string) {
    return (
        principal.scopes.includes('*') ||
        principal.scopes.includes('tools:call') ||
        principal.scopes.includes(`tools:call:${toolName}`)
    )
}

export function taskError(error: unknown): { code?: string; message: string } {
    const message = error instanceof Error ? error.message : String(error)
    const code =
        isObject(error) && typeof Reflect.get(error, 'code') === 'string'
            ? Reflect.get(error, 'code').slice(0, 100)
            : error instanceof Error
              ? error.name.slice(0, 100)
              : undefined
    return { ...(code ? { code } : {}), message: message.slice(0, 2_000) }
}

export function taskNotFound() {
    return new McpTaskProtocolError(
        -32602,
        t('server-ai:Error.McpTaskNotFound', { defaultValue: 'The MCP task was not found.' })
    )
}

export function invalidTaskParams() {
    return new McpTaskProtocolError(
        -32602,
        t('server-ai:Error.McpTaskInvalidParams', { defaultValue: 'The MCP task request is invalid.' })
    )
}
