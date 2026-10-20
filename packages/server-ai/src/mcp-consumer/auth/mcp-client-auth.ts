import type { TToolsetParams } from '@xpert-ai/contracts'
import { resolveMcpConsumerAuthProvider, type McpConsumerAuthProviderRequest } from './mcp-consumer-auth.registry'

export type McpClientAuthOptions = Pick<McpConsumerAuthProviderRequest, 'toolset' | 'serverName' | 'server'> & {
    runtimeContext?: Partial<TToolsetParams>
    xpertId?: string
    fallbackIdentity?: Pick<McpConsumerAuthProviderRequest, 'tenantId' | 'userId'>
}

/** Share execution identity assembly across MCP factories; fallbacks must come from trusted host context. */
export function resolveMcpClientAuthProvider({
    toolset,
    serverName,
    server,
    runtimeContext = {},
    xpertId,
    fallbackIdentity
}: McpClientAuthOptions) {
    const tenantId = runtimeContext.tenantId ?? toolset.tenantId ?? fallbackIdentity?.tenantId
    const organizationId = runtimeContext.organizationId ?? toolset.organizationId
    const userId = runtimeContext.userId ?? fallbackIdentity?.userId

    return resolveMcpConsumerAuthProvider({
        toolset,
        serverName,
        server,
        tenantId,
        organizationId,
        userId,
        runtimeScope: {
            tenantId,
            organizationId,
            userId,
            xpertId: runtimeContext.xpertId ?? xpertId,
            workspaceId: toolset.workspaceId,
            projectId: runtimeContext.projectId,
            conversationId: runtimeContext.conversationId,
            executionId: runtimeContext.executionId
        }
    })
}
