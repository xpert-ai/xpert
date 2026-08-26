import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { JSONValue } from '../core.model'
import type { McpApiKeySubjectType } from './mcp-auth.model'
import type { McpAuthMethod } from './mcp-publication.model'

export const MCP_INVOCATION_STATUSES = ['started', 'succeeded', 'failed', 'denied'] as const
export type McpInvocationStatus = (typeof MCP_INVOCATION_STATUSES)[number]

export interface IMcpInvocationAudit extends IBasePerTenantAndOrganizationEntityModel {
  publicationId: string
  capabilityId?: string | null
  toolsetId?: string | null
  capabilityKey?: string | null
  publicName?: string | null
  authMethod: McpAuthMethod
  subjectType: McpApiKeySubjectType
  subjectId: string
  clientName?: string | null
  requestId: string
  traceId?: string | null
  status: McpInvocationStatus
  durationMs?: number | null
  errorCode?: string | null
  argumentSummary?: JSONValue | null
}
