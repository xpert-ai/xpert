import type { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { RuntimeIdentityScope } from '../runtime-scope'

/** References an existing platform connection. No URLs, credentials or connection overrides. */
export interface McpClientScope {
  actor: Required<Pick<RuntimeIdentityScope, 'tenantId' | 'organizationId' | 'userId'>>
  workspaceId: string
  toolsetId: string
  serverName: string
  signal: AbortSignal
  deadlineAt: number
}

export interface McpClientToolDescriptor {
  name: string
  description?: string
  inputSchema: Record<string, JSONValue>
  outputSchema?: Record<string, JSONValue>
  /** Pins input/output schemas and behavior hints, not authorization or server implementation. */
  contractHash: string
}

export interface McpClientToolResult {
  structuredContent?: Record<string, JSONValue>
  /** Plain text blocks only. Consumers must explicitly opt into a text JSON result contract. */
  text: string[]
}

export interface McpClientToolCall {
  /** Stable host call identity; required inside a controlled execution to prevent replay. */
  operationKey?: string
  toolName: string
  contractHash: string
  arguments: Record<string, JSONValue>
}

/** The host currently permits read-only tools only; requests cannot relax this policy. */
export interface McpClientToolsApi {
  /** Lists enabled, model-visible tools advertising read-only behavior for the current viewer. */
  list(scope: McpClientScope): Promise<McpClientToolDescriptor[]>
  /** Callers must additionally restrict tools to their own approved operation catalog. */
  call(scope: McpClientScope, request: McpClientToolCall): Promise<McpClientToolResult>
}

/** Governed access to existing platform MCP connections. Only implemented capabilities are exposed. */
export interface McpClientRuntimeApi {
  readonly tools: McpClientToolsApi
}

export const McpClientRuntimeCapability = createRuntimeCapability<McpClientRuntimeApi>('platform.mcp.client', {
  description:
    'Governed MCP client access using existing connections and viewer credentials; read-only tools initially.'
})
