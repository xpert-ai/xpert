import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'
import { adaptMcpConnector } from './mcp-native-connector-adapter'
import { McpOAuthConnectorStrategy } from './mcp-oauth.strategy'

jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('../mcp-publication/mcp-oauth.service', () => ({ guardedOAuthFetch: jest.fn() }))

const config = { tenantId: 'tenant', organizationId: 'org', title: 'MCP', serverUrl: 'https://mcp.example.test/mcp' }

function nativeStrategy(): ConnectorStrategyRuntime {
    return {
        definition: {
            provider: 'native',
            label: 'Native',
            mcpOAuthResources: [config.serverUrl],
            authMethods: [{ id: 'oauth', label: 'OAuth', type: 'oauth2' }]
        },
        connect: jest.fn(),
        exchangeAuthorizationCode: jest.fn(),
        resolveRuntimeCredential: jest.fn(),
        refreshCredential: jest.fn()
    }
}

describe('MCP native adapter credential refresh', () => {
    it('prefers the native multi-auth refresh hook and preserves its scope and credential payload', async () => {
        const native = nativeStrategy()
        const credential = { data: { accessToken: 'refreshed', integrationId: 'saved-integration' } }
        native.refreshConnectionCredential = jest.fn().mockResolvedValue(credential)
        const adapted = adaptMcpConnector(new McpOAuthConnectorStrategy(config), [native])
        const input = {
            scope: { tenantId: 'tenant', organizationId: 'org' },
            authMethodId: 'oauth',
            credential: { data: { refreshToken: 'refresh', integrationId: 'saved-integration' } }
        }

        await expect(adapted.refreshConnectionCredential(input)).resolves.toEqual(credential)
        expect(native.refreshConnectionCredential).toHaveBeenCalledWith(input)
        expect(native.refreshCredential).not.toHaveBeenCalled()
    })

    it('propagates a native multi-auth refresh failure without retrying another authorization path', async () => {
        const native = nativeStrategy()
        native.refreshConnectionCredential = jest.fn().mockRejectedValue(new Error('Refresh denied'))
        const adapted = adaptMcpConnector(new McpOAuthConnectorStrategy(config), [native])

        await expect(
            adapted.refreshConnectionCredential({
                authMethodId: 'oauth',
                credential: { data: { refreshToken: 'refresh' } }
            })
        ).rejects.toThrow('Refresh denied')
        expect(native.refreshCredential).not.toHaveBeenCalled()
    })

    it('keeps historical MCP OAuth credentials on their original refresh path', async () => {
        const mcp = new McpOAuthConnectorStrategy(config)
        const credential = { data: { payload: 'refreshed-mcp-state' } }
        const refresh = jest.spyOn(mcp, 'refreshConnectionCredential').mockResolvedValue(credential)
        const native = nativeStrategy()
        native.refreshConnectionCredential = jest.fn()
        const adapted = adaptMcpConnector(mcp, [native])
        const input = { authMethodId: 'mcp-oauth', credential: { data: { payload: 'persisted-mcp-state' } } }

        await expect(adapted.refreshConnectionCredential(input)).resolves.toEqual(credential)
        expect(refresh).toHaveBeenCalledWith(input)
        expect(native.refreshConnectionCredential).not.toHaveBeenCalled()
        expect(native.refreshCredential).not.toHaveBeenCalled()
    })

    it.each([undefined, '', 42])(
        'does not call the legacy hook with an invalid refresh token: %s',
        async (refreshToken) => {
            const native = nativeStrategy()
            const adapted = adaptMcpConnector(new McpOAuthConnectorStrategy(config), [native])

            await expect(
                adapted.refreshConnectionCredential({
                    authMethodId: 'oauth',
                    credential: { data: { refreshToken } }
                })
            ).rejects.toThrow('ConnectorIntegrationUnavailable')
            expect(native.refreshCredential).not.toHaveBeenCalled()
        }
    )
})
