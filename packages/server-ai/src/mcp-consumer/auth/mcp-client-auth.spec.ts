import { MCPServerType } from '@xpert-ai/contracts'
import { resolveMcpClientAuthProvider, type McpClientAuthOptions } from './mcp-client-auth'
import {
    configureMcpConnectorAuthProviderResolver,
    configureMcpConsumerAuthProviderResolver,
    type McpConsumerAuthProviderResolver
} from './mcp-consumer-auth.registry'

describe('shared MCP client authorization', () => {
    const resolver = jest.fn<ReturnType<McpConsumerAuthProviderResolver>, Parameters<McpConsumerAuthProviderResolver>>()
    const options: McpClientAuthOptions = {
        toolset: { tenantId: 'toolset-tenant', organizationId: 'toolset-org', workspaceId: 'workspace' },
        serverName: 'github',
        server: {
            type: MCPServerType.HTTP,
            url: 'https://api.githubcopilot.com/mcp/',
            auth: { type: 'connector', provider: 'github', bindingId: 'binding' }
        },
        xpertId: 'fallback-assistant',
        fallbackIdentity: { tenantId: 'request-tenant', userId: 'request-user' }
    }

    beforeEach(() => {
        resolver.mockReset().mockResolvedValue(undefined)
        configureMcpConnectorAuthProviderResolver(resolver)
        configureMcpConsumerAuthProviderResolver(null)
    })

    afterEach(() => {
        configureMcpConnectorAuthProviderResolver(null)
        configureMcpConsumerAuthProviderResolver(null)
    })

    it('keeps the execution actor consistent across OAuth identity and Connector scope', async () => {
        const runtimeContext = {
            tenantId: 'execution-tenant',
            organizationId: 'execution-org',
            userId: 'execution-user',
            xpertId: 'execution-assistant',
            projectId: 'project',
            conversationId: 'conversation',
            executionId: 'execution'
        }

        await resolveMcpClientAuthProvider({ ...options, runtimeContext })

        expect(resolver).toHaveBeenCalledWith({
            toolset: options.toolset,
            serverName: options.serverName,
            server: options.server,
            tenantId: 'execution-tenant',
            organizationId: 'execution-org',
            userId: 'execution-user',
            runtimeScope: { ...runtimeContext, workspaceId: 'workspace' }
        })
    })

    it('prefers the toolset tenant over request fallback and retains the host user fallback', async () => {
        await resolveMcpClientAuthProvider(options)

        expect(resolver).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'toolset-tenant',
                organizationId: 'toolset-org',
                userId: 'request-user',
                runtimeScope: expect.objectContaining({
                    tenantId: 'toolset-tenant',
                    organizationId: 'toolset-org',
                    userId: 'request-user',
                    workspaceId: 'workspace',
                    xpertId: 'fallback-assistant',
                    conversationId: undefined,
                    executionId: undefined
                })
            })
        )
    })

    it('supports Pro request identity when a toolset has no tenant', async () => {
        await resolveMcpClientAuthProvider({ ...options, toolset: {} })

        expect(resolver).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'request-tenant',
                userId: 'request-user',
                runtimeScope: expect.objectContaining({ tenantId: 'request-tenant', userId: 'request-user' })
            })
        )
    })

    it('preserves the persisted OAuth server key even when it is empty', async () => {
        configureMcpConsumerAuthProviderResolver(resolver)

        await resolveMcpClientAuthProvider({
            ...options,
            serverName: '',
            server: { ...options.server, auth: { type: 'oauth', binding: 'user' } }
        })

        expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ serverName: '' }))
    })
})
