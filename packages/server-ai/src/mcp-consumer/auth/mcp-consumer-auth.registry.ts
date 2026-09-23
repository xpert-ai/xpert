import type { IXpertToolset, TMCPServer } from '@xpert-ai/contracts'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { RuntimeIdentityScope } from '@xpert-ai/plugin-sdk'

export type McpConsumerAuthProviderRequest = {
    toolset: Partial<IXpertToolset>
    serverName: string
    server: TMCPServer
    tenantId?: string
    organizationId?: string
    userId?: string
    runtimeScope?: RuntimeIdentityScope
}

export type McpConsumerAuthProviderResolver = (
    request: McpConsumerAuthProviderRequest
) => Promise<OAuthClientProvider | undefined>

let resolver: McpConsumerAuthProviderResolver | null = null
let connectorResolver: McpConsumerAuthProviderResolver | null = null

export function configureMcpConnectorAuthProviderResolver(next: McpConsumerAuthProviderResolver | null) {
    connectorResolver = next
}

export function configureMcpConsumerAuthProviderResolver(next: McpConsumerAuthProviderResolver | null) {
    resolver = next
}

export function resolveMcpConsumerAuthProvider(request: McpConsumerAuthProviderRequest) {
    if (request.server.auth?.type === 'connector') {
        if (!connectorResolver) throw new Error('MCP Connector runtime is unavailable')
        return connectorResolver(request)
    }
    return resolver?.(request)
}
