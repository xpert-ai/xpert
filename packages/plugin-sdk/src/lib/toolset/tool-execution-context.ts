import type { JSONValue, McpJsonSchema } from '@xpert-ai/contracts'
import type { AgentMiddlewareRuntimeApi } from '../agent/middleware/runtime'
import type { WorkspaceFilesApi } from '../runtime/capabilities/workspace-files'
import type { CapabilityChangeEvent, ToolEventsApi } from '../mcp/events'
import type { ToolTasksApi } from '../mcp/task'

export type ToolExecutionSource = 'agent' | 'mcp' | 'workflow' | 'api'

export interface ToolPrincipal {
  type: 'user' | 'service_account'
  id: string
  userId?: string
  clientId?: string
}

export interface ToolCredentialsApi {
  get<TValue extends JSONValue = JSONValue>(key: string): Promise<TValue | null>
}

export type ToolModelsApi = Pick<AgentMiddlewareRuntimeApi, 'createModelClient' | 'getModelProvider'>

export interface ToolInputFormRequest {
  type: 'form'
  title: string
  schema: McpJsonSchema
}

export interface ToolInputUrlRequest {
  type: 'url'
  url: string
  title?: string
}

export type ToolInputRequest = ToolInputFormRequest | ToolInputUrlRequest

export interface ToolInputApi {
  request<TValue extends JSONValue = JSONValue>(request: ToolInputRequest): Promise<TValue>
}

export interface ToolHostApi {
  files?: WorkspaceFilesApi
  credentials?: ToolCredentialsApi
  models?: ToolModelsApi
  tasks?: ToolTasksApi
  events?: ToolEventsApi
  input?: ToolInputApi
}

export interface ToolExecutionContext {
  source: ToolExecutionSource
  tenantId: string
  organizationId?: string
  /** Present only when the caller deliberately supplied a workspace-scoped execution boundary. */
  workspaceId?: string
  projectId?: string
  principal: ToolPrincipal
  executionId: string
  requestId: string
  traceId?: string
  conversationId?: string
  xpertId?: string
  agentKey?: string
  signal?: AbortSignal
  host: ToolHostApi
}

export type { CapabilityChangeEvent }
