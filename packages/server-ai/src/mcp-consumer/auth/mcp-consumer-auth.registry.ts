import type { IXpertToolset, TMCPServer } from '@xpert-ai/contracts'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'

export type McpConsumerAuthProviderRequest = {
    toolset: Partial<IXpertToolset>
    serverName: string
    server: TMCPServer
    tenantId?: string
    organizationId?: string
    userId?: string
}

export type McpConsumerAuthProviderResolver = (
    request: McpConsumerAuthProviderRequest
) => Promise<OAuthClientProvider | undefined>

let resolver: McpConsumerAuthProviderResolver | null = null

export function configureMcpConsumerAuthProviderResolver(next: McpConsumerAuthProviderResolver | null) {
    resolver = next
}

export function resolveMcpConsumerAuthProvider(request: McpConsumerAuthProviderRequest) {
    return resolver?.(request)
}
