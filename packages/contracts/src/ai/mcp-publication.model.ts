import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { JSONValue } from '../core.model'
import type { McpApiKeySubjectType } from './mcp-auth.model'
import type { McpCapabilityDescriptor, McpCapabilityType } from './mcp-capability.model'

export const MCP_PROTOCOL_VERSION = '2026-07-28' as const
export const MCP_TASK_EXTENSION_ID = 'io.modelcontextprotocol/tasks' as const

export const MCP_HTTP_CORS_REQUEST_HEADERS = [
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'Traceparent',
  'Tracestate',
  'Baggage',
  'X-Request-Id'
] as const

export const MCP_HTTP_CORS_EXPOSED_HEADERS = ['WWW-Authenticate', 'MCP-Protocol-Version', 'X-Request-Id'] as const

export const MCP_PUBLICATION_STATUSES = ['draft', 'active', 'disabled'] as const
export type McpPublicationStatus = (typeof MCP_PUBLICATION_STATUSES)[number]

export const MCP_PUBLICATION_REVIEW_STATUSES = ['current', 'required'] as const
export type McpPublicationReviewStatus = (typeof MCP_PUBLICATION_REVIEW_STATUSES)[number]

export const MCP_AUTH_METHODS = ['api_key', 'oauth'] as const
export type McpAuthMethod = (typeof MCP_AUTH_METHODS)[number]

export const MCP_CAPABILITY_APPROVAL_MODES = ['deny', 'allow', 'confirm'] as const
export type McpCapabilityApprovalMode = (typeof MCP_CAPABILITY_APPROVAL_MODES)[number]

export interface McpCapabilityPolicy {
  approvalMode?: McpCapabilityApprovalMode
  timeoutMs?: number
  rateLimit?: {
    requests: number
    windowSeconds: number
  }
}

export interface IMcpPublication extends IBasePerTenantAndOrganizationEntityModel {
  name: string
  slug: string
  status: McpPublicationStatus
  authMethods: McpAuthMethod[]
  instructions?: string | null
  protocolVersion: typeof MCP_PROTOCOL_VERSION
  reviewStatus: McpPublicationReviewStatus
  reviewReason?: string | null
  reviewedAt?: Date | null
  reviewedById?: string | null
}

/** Management-list projection used to render publication health without per-card follow-up requests. */
export interface IMcpPublicationSummary extends IMcpPublication {
  capabilityCount: number
  apiKeyCount: number
  oauthEnabled: boolean
  recentInvocationAt?: Date | null
  recentErrorAt?: Date | null
}

export interface IMcpPublicationCapability extends IBasePerTenantAndOrganizationEntityModel {
  publicationId: string
  toolsetId: string
  capabilityType: McpCapabilityType
  capabilityKey: string
  publicName: string
  enabled: boolean
  policy?: McpCapabilityPolicy | null
  descriptorHash: string
  descriptorSnapshot: McpCapabilityDescriptor
  pluginVersion?: string | null
}

/** Current plugin-declared capability catalog for a concrete toolset instance. */
export interface IMcpCapabilityCatalog extends IBasePerTenantAndOrganizationEntityModel {
  toolsetId: string
  capabilityType: McpCapabilityType
  capabilityKey: string
  descriptorHash: string
  descriptor: McpCapabilityDescriptor
  enabled: boolean
}

/** Selectable capability source summary used to lazily load one toolset catalog at a time. */
export interface IMcpCapabilitySourceSummary {
  toolsetId: string
  name: string
  pluginName?: string
  capabilityCount: number
}

export const MCP_TASK_STATUSES = ['working', 'input_required', 'completed', 'failed', 'cancelled'] as const
export type McpTaskStatus = (typeof MCP_TASK_STATUSES)[number]

export interface IMcpTask extends IBasePerTenantAndOrganizationEntityModel {
  taskId: string
  publicationId: string
  capabilityId: string
  executionId: string
  requestId: string
  toolName: string
  idempotencyKey: string
  inputHash: string
  subjectType: McpApiKeySubjectType
  subjectId: string
  queueJobId?: string | null
  status: McpTaskStatus
  statusMessage?: string | null
  progress?: number | null
  pollIntervalMs?: number | null
  inputRequests?: JSONValue | null
  inputResponses?: JSONValue | null
  requestPayload?: JSONValue | null
  resultRef?: JSONValue | null
  error?: {
    code?: string
    message: string
  } | null
  revision: number
  expiresAt: Date
}
