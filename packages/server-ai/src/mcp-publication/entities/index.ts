import { McpApiKey } from './mcp-api-key.entity'
import { McpCapabilityCatalog } from './mcp-capability-catalog.entity'
import { McpInvocationAudit } from './mcp-invocation-audit.entity'
import { McpOAuthPolicy } from './mcp-oauth-policy.entity'
import { McpPublicationCapability } from './mcp-publication-capability.entity'
import { McpPublicationAccess } from './mcp-publication-access.entity'
import { McpPublication } from './mcp-publication.entity'
import { McpTask } from './mcp-task.entity'

export * from './mcp-api-key.entity'
export * from './mcp-capability-catalog.entity'
export * from './mcp-invocation-audit.entity'
export * from './mcp-oauth-policy.entity'
export * from './mcp-publication-capability.entity'
export * from './mcp-publication-access.entity'
export * from './mcp-publication.entity'
export * from './mcp-task.entity'

export const MCP_PUBLICATION_ENTITIES = [
    McpPublication,
    McpCapabilityCatalog,
    McpPublicationCapability,
    McpPublicationAccess,
    McpApiKey,
    McpOAuthPolicy,
    McpInvocationAudit,
    McpTask
] as const
