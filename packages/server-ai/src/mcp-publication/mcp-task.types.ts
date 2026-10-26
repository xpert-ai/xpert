import type { JSONValue, McpTaskStatus, McpPublicationRuntimeConfiguration } from '@xpert-ai/contracts'
import type { CallToolResult } from '@modelcontextprotocol/server'

export interface McpTaskJobPayload {
    /** Server-obtained approval for this queued invocation; never supplied by tool arguments. */
    approvalGranted?: boolean
    generation?: string
    version: 1
    taskId: string
    publicationId: string
    capabilityId: string
    tenantId: string
    organizationId?: string | null
    toolsetId: string
    capabilityKey: string
    serverName?: string
    remoteName?: string
    remoteTaskMode?: 'optional' | 'required'
    arguments: JSONValue
    principal: {
        type: 'user' | 'service_account'
        id: string
        userId?: string
        clientId?: string
    }
    traceId?: string
    appResourceUri?: string
    runtime?: McpPublicationRuntimeConfiguration | null
}

export interface McpCreateTaskResult extends CallToolResult {
    resultType: 'task'
    taskId: string
    status: McpTaskStatus
    statusMessage?: string
    createdAt: string
    lastUpdatedAt: string
    ttlMs: number | null
    pollIntervalMs?: number
}

export type McpDetailedTask = {
    _meta?: object
    resultType: 'complete'
    taskId: string
    status: McpTaskStatus
    statusMessage?: string
    createdAt: string
    lastUpdatedAt: string
    ttlMs: number | null
    pollIntervalMs?: number
    inputRequests?: JSONValue
    result?: JSONValue
    error?: JSONValue
}

export class McpTaskProtocolError extends Error {
    constructor(
        readonly code: number,
        message: string,
        readonly data?: JSONValue
    ) {
        super(message)
    }
}
