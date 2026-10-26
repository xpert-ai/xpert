import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { McpPrincipal } from './mcp-auth.model'
import type { McpExecutionReceipt, McpOperationIdentity } from './mcp-execution-control.schema'
import type { McpConsumerTask } from './mcp-task.schema'

export type McpOperationAuthority =
  | { kind: 'workspace' }
  | { kind: 'assistant'; xpertId: string; projectId?: string }
  | { kind: 'publication'; principal: McpPrincipal }

export interface McpOperationScope {
  actor: { tenantId: string; organizationId: string | null; userId: string | null }
  workspaceId: string
  toolsetId: string
  authority?: McpOperationAuthority
  serverName: string
}
export interface McpOperationRecord {
  version: 1
  scope: McpOperationScope
  connectionVersion: string
  reconnectable: boolean
  identity: McpOperationIdentity
  serverId: string | null
  mode: 'task' | 'call'
  phase: 'reserved' | 'sending' | 'observing' | 'settled' | 'unknown'
  hostId: string
  claim: string
  taskId?: string
  receipt?: McpExecutionReceipt
  task?: McpConsumerTask
  result?: object
  callReturned?: boolean
  hostExited: boolean
  inputResponses: Record<string, object>
  inputLease?: { key: string; owner: string; expiresAt: number }
  failureCount: number
}

/** Internal durable call identity and control data; not a public diagnostic view. */
export interface IMcpRemoteOperation extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  operationKey: string
  targetId: string
  generation: string
  record: McpOperationRecord
  nextControlAt: Date | null
}
