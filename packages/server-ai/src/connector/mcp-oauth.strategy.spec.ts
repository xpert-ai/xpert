import { createHash } from 'node:crypto'
import type { FetchLike } from '@modelcontextprotocol/sdk-oauth/shared/transport.js'
import { McpOAuthConnectorStrategy, mcpConnectorProvider } from './mcp-oauth.strategy'
import { connectorMcpProvider } from './connector-mcp-provider'
import type { ConnectorRuntimeCredentialV2 } from '@xpert-ai/plugin-sdk'

jest.mock('../mcp-publication/mcp-oauth.service', () => ({ guardedOAuthFetch: jest.fn() }))

const config = {
    tenantId: 'tenant',
    organizationId: 'org',
    title: 'Test MCP',
    serverUrl: 'https://mcp.example.test/v2/mcp',
    scopes: ['read']
}
const redirectUri = 'https://xpert.example.test/api/connector/oauth/callback'
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

describe('MCP OAuth through Connector', () => {
    it('isolates account identities by tenant, organization, endpoint and scopes', () => {
        const key = mcpConnectorProvider(config)
        for (const change of [
            { tenantId: 'other' },
            { organizationId: 'other' },
            { serverUrl: 'https://other.example/mcp' },
            { scopes: ['write'] }
        ])
            expect(mcpConnectorProvider({ ...config, ...change })).not.toBe(key)
        expect(mcpConnectorProvider({ ...config, scopes: ['read', 'read'] })).toBe(key)
        const branded = { ...config, icon: { type: 'image' as const, value: 'https://mcp.example.test/icon.svg' } }
        expect(new McpOAuthConnectorStrategy(branded).definition.icon).toEqual(branded.icon)
        expect(mcpConnectorProvider(branded)).toBe(key)
    })

    it.each([config.serverUrl, 'https://MCP.EXAMPLE.TEST:443/v2/mcp'])(
        'restores OAuth sessions and credentials on another replica with endpoint %s',
        async (restoredServerUrl) => {
            let challenge = ''
            let exchanges = 0
            const requests: string[] = []
            const fetcher: FetchLike = async (url, init) => {
                const target = String(url)
                requests.push(target)
                if (target === 'https://mcp.example.test/.well-known/oauth-protected-resource/v2/mcp')
                    return json({ resource: config.serverUrl, authorization_servers: ['https://auth.example.test'] })
                if (target === 'https://auth.example.test/.well-known/oauth-authorization-server')
                    return json({
                        issuer: 'https://auth.example.test',
                        authorization_endpoint: 'https://auth.example.test/authorize',
                        token_endpoint: 'https://auth.example.test/token',
                        registration_endpoint: 'https://auth.example.test/register',
                        response_types_supported: ['code'],
                        code_challenge_methods_supported: ['S256'],
                        token_endpoint_auth_methods_supported: ['none']
                    })
                if (target.endsWith('/register'))
                    return json({ client_id: 'registered-test-client', redirect_uris: [redirectUri] })
                if (target.endsWith('/token')) {
                    const params = new URLSearchParams(String(init?.body))
                    expect(params.get('resource')).toBe(config.serverUrl)
                    expect(params.get('client_id')).toBe('registered-test-client')
                    if (exchanges++ === 0) {
                        expect(params.get('grant_type')).toBe('authorization_code')
                        expect(params.get('code')).toBe('test-code')
                        expect(createHash('sha256').update(params.get('code_verifier')).digest('base64url')).toBe(
                            challenge
                        )
                        return json({
                            access_token: 'test-access',
                            token_type: 'Bearer',
                            refresh_token: 'test-refresh',
                            expires_in: 3600,
                            scope: 'read'
                        })
                    }
                    expect(params.get('grant_type')).toBe('refresh_token')
                    expect(params.get('refresh_token')).toBe('test-refresh')
                    return json({
                        access_token: 'rotated-access',
                        token_type: 'Bearer',
                        refresh_token: 'rotated-refresh',
                        expires_in: 3600,
                        scope: 'read'
                    })
                }
                return new Response('', { status: 404 })
            }
            const strategy = new McpOAuthConnectorStrategy(config, fetcher)
            const started = await strategy.connect({ authMethodId: 'mcp-oauth', redirectUri, state: 'test-state' })
            const url = new URL(started.authorizationUrl)
            expect(url.searchParams.get('state')).toBe('test-state')
            expect(url.searchParams.get('resource')).toBe(config.serverUrl)
            expect(url.searchParams.get('code_challenge_method')).toBe('S256')
            challenge = url.searchParams.get('code_challenge')
            const restored = new McpOAuthConnectorStrategy({ ...config, serverUrl: restoredServerUrl }, fetcher)
            expect(restored.definition.provider).toBe(strategy.definition.provider)
            await expect(
                restored.exchangeAuthorizationCode({
                    authMethodId: 'mcp-oauth',
                    redirectUri: 'https://wrong.example/callback',
                    code: 'test-code',
                    metadata: started.metadata
                })
            ).rejects.toThrow()
            const credential = await restored.exchangeAuthorizationCode({
                authMethodId: 'mcp-oauth',
                redirectUri,
                code: 'test-code',
                metadata: started.metadata
            })
            expect(credential.data.payload).not.toContain('verifier')
            const runtime = restored.resolveRuntimeCredential({ authMethodId: 'mcp-oauth', credential })
            expect(runtime).toEqual({
                accessToken: 'test-access',
                resource: config.serverUrl,
                serverUrl: config.serverUrl
            })
            expect(runtime).not.toHaveProperty('refreshToken')
            const refreshed = await restored.refreshConnectionCredential({ authMethodId: 'mcp-oauth', credential })
            expect(
                restored.resolveRuntimeCredential({ authMethodId: 'mcp-oauth', credential: refreshed }).accessToken
            ).toBe('rotated-access')
            expect(requests).toContain('https://mcp.example.test/.well-known/oauth-protected-resource/v2/mcp')
        }
    )

    it.each([
        'http://mcp.example.test/v2/mcp',
        'https://mcp.example.test:8443/v2/mcp',
        'https://other.example.test/v2/mcp',
        'https://mcp.example.test/v2/mcp/',
        'https://mcp.example.test/v2/mcp?account=other'
    ])('rejects persisted credentials for a different endpoint: %s', (serverUrl) => {
        const strategy = new McpOAuthConnectorStrategy(config)
        const credential = {
            data: {
                payload: JSON.stringify({
                    version: 1,
                    serverUrl,
                    redirectUri,
                    resource: config.serverUrl,
                    tokens: { access_token: 'test-only', token_type: 'Bearer' }
                })
            }
        }
        expect(() => strategy.resolveRuntimeCredential({ authMethodId: 'mcp-oauth', credential })).toThrow()
    })

    it('rechecks grants on each request and rejects wrong audience, provider or scope', async () => {
        const credential: ConnectorRuntimeCredentialV2 = {
            connectorId: 'binding',
            bindingId: 'binding',
            scope: { type: 'workspace', workspaceId: 'workspace' },
            authorizationMode: 'personal',
            provider: 'provider',
            authMethodId: 'oauth',
            scopes: ['read'],
            credentials: { accessToken: 'test-only', resource: 'https://mcp.example.test', serverUrl: config.serverUrl }
        }
        const resolve = jest.fn().mockResolvedValue(credential)
        const provider = connectorMcpProvider(resolve, {
            provider: 'provider',
            serverUrl: config.serverUrl,
            scopes: ['read']
        })
        expect(await provider.tokens()).toEqual({ access_token: 'test-only', token_type: 'Bearer', scope: 'read' })
        for (const serverUrl of ['https://MCP.EXAMPLE.TEST:443/v2/mcp', undefined]) {
            // Legacy native connector credentials may omit serverUrl entirely.
            resolve.mockResolvedValueOnce({ ...credential, credentials: { ...credential.credentials, serverUrl } })
            await expect(provider.tokens()).resolves.toMatchObject({ access_token: 'test-only' })
        }
        resolve.mockRejectedValueOnce(new Error('revoked'))
        await expect(provider.tokens()).rejects.toThrow('revoked')
        for (const invalid of [
            { ...credential, provider: 'wrong' },
            { ...credential, scopes: [] },
            { ...credential, credentials: { ...credential.credentials, resource: 'https://other.example' } },
            ...[
                'https://other.example/mcp',
                'http://mcp.example.test/v2/mcp',
                'https://mcp.example.test:8443/v2/mcp',
                'https://mcp.example.test/v2/mcp/',
                'https://mcp.example.test/v2/mcp?account=other',
                '/v2/mcp',
                null,
                123
            ].map((serverUrl) => ({ ...credential, credentials: { ...credential.credentials, serverUrl } }))
        ]) {
            resolve.mockResolvedValueOnce(invalid)
            await expect(provider.tokens()).rejects.toThrow()
        }
        expect(() => provider.redirectToAuthorization(new URL('https://other.example'))).toThrow()
    })
})
