import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { McpAuthMethod } from './mcp-publication.model'

export const MCP_API_KEY_SUBJECT_TYPES = ['user', 'service_account'] as const
export type McpApiKeySubjectType = (typeof MCP_API_KEY_SUBJECT_TYPES)[number]

export interface IMcpApiKey extends IBasePerTenantAndOrganizationEntityModel {
  publicationId: string
  name: string
  keyPrefix: string
  keyHash: string
  subjectType: McpApiKeySubjectType
  subjectId: string
  scopes: string[]
  expiresAt?: Date | null
  lastUsedAt?: Date | null
  revokedAt?: Date | null
  revokedById?: string | null
}

export interface McpOAuthSubjectMapping {
  subjectClaim: string
  emailClaim?: string
  clientIdClaim?: string
}

export interface IMcpOAuthPolicy extends IBasePerTenantAndOrganizationEntityModel {
  publicationId: string
  issuer: string
  audience: string
  requiredScopes: string[]
  subjectMapping: McpOAuthSubjectMapping
  introspectionEnabled: boolean
  introspectionEndpoint?: string | null
  introspectionClientId?: string | null
  introspectionClientSecretConfigured: boolean
  enabled: boolean
}

export interface McpPrincipal {
  authMethod: McpAuthMethod
  credentialPrefix?: string
  subjectType: McpApiKeySubjectType
  subjectId: string
  userId?: string
  clientId?: string
  tenantId: string
  organizationId?: string
  publicationId: string
  scopes: string[]
}
