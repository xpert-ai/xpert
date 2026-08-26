import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { MCP_PROTOCOL_VERSION, MCP_TASK_EXTENSION_ID } from '@xpert-ai/contracts'
import type { z } from 'zod'

export const MCP_CONSUMER_PROTOCOL_VERSION = MCP_PROTOCOL_VERSION
export { MCP_TASK_EXTENSION_ID }
export const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion'
export const MCP_CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo'
export const MCP_CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities'

export type McpConsumerExtensionRequest = {
    method: string
    params?: object
}

export type McpConsumerRoutingHeaders = {
    method: string
    name?: string
}

export type McpConsumerNotification = {
    method: string
    params?: object
}

export type McpConsumerServerDescriptor = {
    supportedVersions: string[]
    capabilities: object
    serverInfo?: { name: string; version: string }
    instructions?: string
}

export interface McpConsumerConnection {
    serverNames(): string[]
    resolveServerName(serverName?: string): string
    usesModernHttp(serverName?: string): boolean
    formatToolName(serverName: string, toolName: string): string
    describeServer(serverName?: string): Promise<McpConsumerServerDescriptor>
    getClient(serverName?: string): Promise<Client>
    getLangChainTools(serverNames?: string[]): Promise<DynamicStructuredTool[]>
    requestExtension<TSchema extends z.ZodType<object>>(
        serverName: string | undefined,
        request: McpConsumerExtensionRequest,
        resultSchema: TSchema,
        options?: {
            routing?: McpConsumerRoutingHeaders
            signal?: AbortSignal
            timeoutMs?: number
        }
    ): Promise<z.infer<TSchema>>
    listenExtension(
        serverName: string | undefined,
        request: McpConsumerExtensionRequest,
        options: {
            routing: McpConsumerRoutingHeaders
            signal: AbortSignal
        }
    ): Promise<AsyncIterable<McpConsumerNotification>>
}

export class McpConsumerProtocolError extends Error {
    constructor(
        message: string,
        readonly code?: number,
        readonly data?: unknown
    ) {
        super(message)
    }
}

export class McpConsumerHttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly authenticate?: string
    ) {
        super(message)
    }
}
