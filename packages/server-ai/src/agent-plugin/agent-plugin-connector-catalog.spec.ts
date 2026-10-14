import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FindOperator } from 'typeorm'
import { ConnectorStrategyRegistry, RequestContext, StrategyBus } from '@xpert-ai/plugin-sdk'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { ConnectorService } from '../connector/connector.service'
import { Connector } from '../connector/connector.entity'
import { ConnectorOAuthSession } from '../connector/connector-oauth-session.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { McpOAuthConnectorStrategy, mcpConnectorProvider } from '../connector/mcp-oauth.strategy'
import { connectorMcpProvider } from '../connector/connector-mcp-provider'
import { ConnectorProviderService } from '../connector/connector-provider.service'
import { ResolvePluginConnectorsHandler } from './queries/resolve-plugin-connectors.handler'
import { guardedOAuthFetch } from '../mcp-publication/mcp-oauth.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { importedPluginBinding } from './installed-plugin-catalog'
import { ForbiddenException } from '@nestjs/common'
import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'

jest.mock('i18next', () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }))
jest.mock('../mcp-publication/mcp-oauth.service', () => ({ guardedOAuthFetch: jest.fn() }))
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('../../../server/src/core/utils/crypto'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext,
    TenantOrganizationBaseEntity: class {},
    TenantBaseEntity: class {}
}))
jest.mock('../xpert-workspace/workspace.entity', () => ({ XpertWorkspace: class {} }))
jest.mock('../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
jest.mock('../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../xpert-project/services/project-access.service', () => ({ XpertProjectAccessService: class {} }))

const scope = { tenantId: 'tenant', organizationId: 'org' }
const workspaceId = 'workspace'
const githubConfig = { ...scope, title: 'GitHub (github)', serverUrl: 'https://api.githubcopilot.com/mcp/' }
const githubProvider = mcpConnectorProvider(githubConfig)

function githubPackage(): AgentPluginPackage {
    return {
        id: 'github-package',
        tenantId: scope.tenantId,
        organizationId: null,
        rootPath: '/plugins/github',
        digest: 'github-digest',
        source: { kind: 'zip' },
        descriptor: {
            name: 'github',
            skills: [],
            diagnostics: [],
            servers: [{ key: 'github', config: { type: 'streamable-http', url: githubConfig.serverUrl } }],
            extension: {
                version: 1,
                interface: { displayName: 'GitHub' },
                connectors: { github: { type: 'mcp_oauth' } }
            }
        }
    }
}

describe('Agent Plugin connectors through the Connector API', () => {
    let packages: MemoryRepository<AgentPluginPackage>
    let bindings: MemoryRepository<AgentResourceBinding>
    let connectors: MemoryRepository<Connector>
    let sessions: MemoryRepository<ConnectorOAuthSession>
    let replicas: TestingModule[]
    const access = {
        assertCanRead: jest.fn(),
        assertCanManage: jest.fn(),
        assertCanRun: jest.fn()
    }

    beforeEach(() => {
        packages = new MemoryRepository([githubPackage()])
        bindings = new MemoryRepository()
        connectors = new MemoryRepository()
        sessions = new MemoryRepository()
        replicas = []
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        access.assertCanRead.mockResolvedValue({ workspace: { id: workspaceId, ...scope } })
        access.assertCanManage.mockResolvedValue({ workspace: { id: workspaceId, ...scope } })
        jest.mocked(guardedOAuthFetch).mockReset()
    })

    afterEach(async () => {
        for (const module of replicas) await module.close()
        jest.restoreAllMocks()
    })

    async function replica() {
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot(), DiscoveryModule],
            providers: [
                ConnectorService,
                ConnectorProviderService,
                ResolvePluginConnectorsHandler,
                ConnectorStrategyRegistry,
                StrategyBus,
                AgentPluginConnectorService,
                { provide: getRepositoryToken(AgentPluginPackage), useValue: packages },
                { provide: getRepositoryToken(AgentResourceBinding), useValue: bindings },
                { provide: getRepositoryToken(Connector), useValue: connectors },
                { provide: getRepositoryToken(ConnectorOAuthSession), useValue: sessions },
                { provide: XpertWorkspaceAccessService, useValue: access },
                {
                    provide: PublishedXpertAccessService,
                    useValue: {
                        getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
                            id: 'assistant',
                            workspaceId,
                            workspace: scope
                        })
                    }
                }
            ]
        }).compile()
        replicas.push(module)
        await module.init()
        return module.get(ConnectorService)
    }

    it('never resolves a stale process-local dynamic provider outside its persisted tenant', async () => {
        await replica()
        const registry = replicas[0].get(ConnectorStrategyRegistry)
        registry.register(githubProvider, new McpOAuthConnectorStrategy(githubConfig), {
            kind: 'builtin',
            scopeKey: scope.organizationId
        })
        const providers = replicas[0].get(ConnectorProviderService)
        await expect(
            providers.findRuntime(githubProvider, scope.organizationId, 'other-tenant')
        ).resolves.toBeUndefined()
        await expect(providers.getRuntime(githubProvider, scope.organizationId, 'other-tenant')).rejects.toThrow()
    })

    it('lists imported tenant MCP OAuth connectors on a cold API without creating connections or grants', async () => {
        const api = await replica()
        const definitions = await api.definitionsForScope({ type: 'workspace', workspaceId })

        expect(definitions).toEqual([
            expect.objectContaining({ provider: githubProvider, label: 'GitHub (github)', runtimeUsage: 'credential' })
        ])
        expect(packages.items).toEqual([githubPackage()])
        expect(bindings.items).toEqual([])
        expect(connectors.items).toEqual([])
        expect(sessions.items).toEqual([])
        expect(guardedOAuthFetch).not.toHaveBeenCalled()
    })

    it('restores tenant workspace providers on every cold replica without exposing organization packages', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        access.assertCanRead.mockResolvedValue({
            workspace: { id: workspaceId, tenantId: scope.tenantId, organizationId: null }
        })
        const organizationPackage = githubPackage()
        organizationPackage.id = 'organization-package'
        organizationPackage.organizationId = scope.organizationId
        organizationPackage.descriptor.name = 'organization-only'
        organizationPackage.descriptor.servers[0].config.url = 'https://organization.example.test/mcp'
        packages.items.push(organizationPackage)

        for (let index = 0; index < 2; index++) {
            const api = await replica()
            const definitions = await api.definitionsForScope({ type: 'workspace', workspaceId })
            expect(definitions).toEqual([
                expect.objectContaining({ label: 'GitHub (github)', runtimeUsage: 'credential' })
            ])
            expect(definitions[0].provider).not.toBe(githubProvider)
        }
    })

    it('keeps missing existing-provider dependencies visible with an actionable status', async () => {
        packages.items[0].descriptor.extension.connectors.github = {
            type: 'existing',
            provider: 'github',
            resource: githubConfig.serverUrl
        }
        const api = await replica()
        const definitions = await api.definitionsForScope({ type: 'workspace', workspaceId })
        expect(definitions).toEqual([expect.objectContaining({ provider: 'github', unavailable: expect.any(String) })])
        await expect(
            api.createBinding({
                scope: { type: 'workspace', workspaceId },
                provider: 'github',
                authorizationMode: 'shared'
            })
        ).rejects.toThrow()
        expect(connectors.items).toEqual([])
    })

    it('routes legacy MCP provider IDs through explicitly declared native auth without changing binding IDs', async () => {
        const api = await replica()
        const nativeConnect = jest
            .fn()
            .mockResolvedValue({ status: 'active', credential: { data: { accessToken: 'pat', tokenType: 'bearer' } } })
        replicas[0].get(ConnectorStrategyRegistry).register(
            'github',
            {
                definition: {
                    provider: 'github',
                    label: 'GitHub',
                    mcpOAuthResources: [githubConfig.serverUrl],
                    authMethods: [
                        {
                            id: 'pat',
                            label: 'PAT',
                            type: 'api_key',
                            credentials: { fields: [{ name: 'token', label: 'Token', required: true }] }
                        }
                    ]
                },
                connect: nativeConnect,
                exchangeAuthorizationCode: jest.fn(),
                resolveRuntimeCredential: jest.fn()
            },
            { kind: 'builtin', scopeKey: scope.organizationId }
        )
        const result = await api.connect(workspaceId, githubProvider, {
            authMethodId: 'pat',
            values: { token: 'pat' },
            redirectUri: 'https://xpert.example.test/callback'
        })
        expect(result.status).toBe('active')
        expect(result.connector.provider).toBe(githubProvider)
        expect(nativeConnect).toHaveBeenCalled()
        expect(guardedOAuthFetch).not.toHaveBeenCalled()
    })

    it('refreshes adapted native credentials through the legacy hook after a cold replica restart', async () => {
        const api = await replica()
        const app = { appId: 'legacy-app', appSecret: 'legacy-secret' }
        const profile = { name: 'Connected User' }
        const expired = new Date(Date.now() - 60_000).toISOString()
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
        const refreshExpiresAt = new Date(Date.now() + 86_400_000).toISOString()
        const refreshCredential = jest
            .fn()
            .mockResolvedValueOnce({
                appId: app.appId,
                accessToken: 'first-refreshed-access',
                refreshToken: 'rotated-refresh',
                expiresAt: expired,
                refreshExpiresAt,
                scopes: ['read'],
                profile
            })
            .mockResolvedValueOnce({
                appId: app.appId,
                accessToken: 'second-refreshed-access',
                refreshToken: 'second-refresh',
                expiresAt,
                refreshExpiresAt,
                scopes: ['read'],
                profile
            })
        const native: ConnectorStrategyRuntime = {
            definition: {
                provider: 'github',
                label: 'GitHub',
                mcpOAuthResources: [githubConfig.serverUrl],
                authMethods: [{ id: 'oauth', label: 'OAuth', type: 'oauth2' }]
            },
            connect: jest.fn().mockResolvedValue({
                status: 'active',
                credential: {
                    data: { app, accessToken: 'expired-access', refreshToken: 'original-refresh' },
                    expiresAt: expired
                }
            }),
            exchangeAuthorizationCode: jest.fn(),
            resolveRuntimeCredential: (input) => ({ accessToken: input.credential.data.accessToken }),
            refreshCredential
        }
        replicas[0].get(ConnectorStrategyRegistry).register('github', native, {
            kind: 'builtin',
            scopeKey: scope.organizationId
        })
        const started = await api.connect(workspaceId, githubProvider, {
            authMethodId: 'oauth',
            redirectUri: 'https://xpert.example.test/callback'
        })
        expect(started.status).toBe('active')

        const restarted = await replica()
        replicas[1].get(ConnectorStrategyRegistry).register('github', native, {
            kind: 'builtin',
            scopeKey: scope.organizationId
        })
        const reference = { bindingId: started.connector.id, provider: githubProvider }
        const runtimeScope = {
            ...scope,
            userId: 'user',
            xpertId: 'assistant',
            conversationId: 'conversation',
            executionId: 'execution',
            connectorBindingIds: [reference.bindingId]
        }
        await expect(restarted.getRuntimeConnectorCredentialForScope(reference, runtimeScope)).resolves.toMatchObject({
            ...reference,
            authMethodId: 'oauth',
            credentials: { accessToken: 'first-refreshed-access' },
            scopes: ['read'],
            profile
        })
        const refreshed = await restarted.getRuntimeConnectorCredentialForScope(reference, runtimeScope)
        expect(refreshed).toMatchObject({
            ...reference,
            credentials: { accessToken: 'second-refreshed-access' },
            expiresAt
        })
        expect(refreshCredential).toHaveBeenNthCalledWith(1, { app, refreshToken: 'original-refresh' })
        expect(refreshCredential).toHaveBeenNthCalledWith(2, { app, refreshToken: 'rotated-refresh' })
        expect(JSON.stringify(refreshed)).not.toContain(app.appSecret)
        expect(guardedOAuthFetch).not.toHaveBeenCalled()
    })

    it('keeps an old binding manageable after importing an existing-provider package upgrade', async () => {
        const api = await replica()
        const registry = replicas[0].get(ConnectorStrategyRegistry)
        registry.register(
            'github',
            {
                definition: {
                    provider: 'github',
                    label: 'GitHub',
                    mcpOAuthResources: [githubConfig.serverUrl],
                    authMethods: [{ id: 'oauth', label: 'OAuth', type: 'oauth2' }]
                },
                connect: jest.fn(),
                exchangeAuthorizationCode: jest.fn(),
                resolveRuntimeCredential: jest.fn()
            },
            { kind: 'builtin', scopeKey: scope.organizationId }
        )
        const binding = await api.createBinding({
            provider: githubProvider,
            authorizationMode: 'shared',
            scope: { type: 'workspace', workspaceId }
        })
        const upgraded = githubPackage()
        upgraded.id = 'upgraded'
        upgraded.createdAt = new Date('2026-10-13')
        upgraded.descriptor.extension.connectors.github = {
            type: 'existing',
            provider: 'github',
            resource: githubConfig.serverUrl
        }
        packages.items.push(upgraded)
        const definitions = await api.definitionsForScope({ type: 'workspace', workspaceId })
        expect(definitions).toEqual([
            expect.objectContaining({ provider: githubProvider, canonicalProvider: 'github' })
        ])
        expect((await api.listBindings({ type: 'workspace', workspaceId }))[0].id).toBe(binding.id)
    })

    it('reflects import and disable immediately while retaining native and existing connector definitions', async () => {
        packages.items.splice(0)
        const api = await replica()
        const registry = replicas[0].get(ConnectorStrategyRegistry)
        registry.register(
            'lark',
            { definition: { provider: 'lark', label: 'Lark', auth: { type: 'oauth2' } } },
            {
                kind: 'builtin',
                scopeKey: scope.organizationId
            }
        )
        expect((await api.definitions(workspaceId)).map((item) => item.provider)).toEqual(['lark'])

        const pkg = githubPackage()
        packages.items.push(pkg)
        expect((await api.definitions(workspaceId)).map((item) => item.provider).sort()).toEqual(
            [githubProvider, 'lark'].sort()
        )
        // A legacy install has warmed this process. Disabling still hides its generated catalog entry.
        replicas[0]
            .get(AgentPluginConnectorService)
            .register(pkg, pkg.descriptor.extension.connectors, scope.organizationId)
        bindings.items.push({ ...importedPluginBinding(pkg), enabled: false })
        expect((await api.definitions(workspaceId)).map((item) => item.provider)).toEqual(['lark'])

        const existing = githubPackage()
        existing.id = 'existing'
        existing.descriptor.name = 'existing-plugin'
        existing.descriptor.extension.connectors.github = {
            type: 'existing',
            provider: 'lark',
            resource: githubConfig.serverUrl
        }
        packages.items.push(existing)
        expect((await api.providerOptions(workspaceId)).map((item) => item.value)).toEqual(['lark'])
        expect(connectors.items).toEqual([])
    })

    it('uses the organization override and does not reveal packages from another tenant or organization', async () => {
        const local = githubPackage()
        local.id = 'local'
        local.organizationId = scope.organizationId
        local.descriptor.servers[0].config.url = 'https://local.example.test/mcp'
        const foreignOrg = githubPackage()
        foreignOrg.id = 'foreign-org'
        foreignOrg.organizationId = 'other-org'
        foreignOrg.descriptor.name = 'foreign-org'
        const foreignTenant = githubPackage()
        foreignTenant.id = 'foreign-tenant'
        foreignTenant.tenantId = 'other-tenant'
        foreignTenant.descriptor.name = 'foreign-tenant'
        packages.items.push(local, foreignOrg, foreignTenant)
        const api = await replica()
        const localProvider = mcpConnectorProvider({ ...githubConfig, serverUrl: 'https://local.example.test/mcp' })
        expect(
            (await api.definitionsForScope({ type: 'workspace', workspaceId })).map((item) => item.provider)
        ).toEqual([localProvider])
        bindings.items.push({ ...importedPluginBinding(local), enabled: false })
        expect(await api.definitions(workspaceId)).toEqual([])

        const foreignProvider = mcpConnectorProvider({ ...githubConfig, tenantId: 'other-tenant' })
        await expect(
            api.connect(workspaceId, foreignProvider, { redirectUri: 'https://xpert.example.test/callback' })
        ).rejects.toThrow()
        expect(guardedOAuthFetch).not.toHaveBeenCalled()
        expect(connectors.items).toEqual([])
    })

    it('retains workspace permission checks before listing or creating a connection', async () => {
        const api = await replica()
        access.assertCanRead.mockRejectedValue(new ForbiddenException())
        access.assertCanManage.mockRejectedValue(new ForbiddenException())
        await expect(api.definitionsForScope({ type: 'workspace', workspaceId })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        await expect(
            api.connect(workspaceId, githubProvider, { redirectUri: 'https://xpert.example.test/callback' })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(connectors.items).toEqual([])
        expect(guardedOAuthFetch).not.toHaveBeenCalled()
    })

    it('keeps valid connectors visible when another imported package has a failed MCP component', async () => {
        const incomplete = githubPackage()
        incomplete.id = 'incomplete-package'
        incomplete.descriptor.name = 'incomplete'
        incomplete.descriptor.servers = []
        incomplete.descriptor.diagnostics = [{ component: 'mcp', code: 'invalid_server', message: 'Invalid server' }]
        packages.items.push(incomplete)
        const api = await replica()
        expect((await api.definitions(workspaceId)).map((item) => item.provider)).toEqual([githubProvider])
        await expect(
            api.createBinding({
                provider: githubProvider,
                authorizationMode: 'shared',
                scope: { type: 'workspace', workspaceId }
            })
        ).resolves.toMatchObject({ provider: githubProvider, status: 'disconnected' })
    })

    it.each([true, false])(
        'starts a cold API with a failed organization MCP component in a persisted binding (enabled: %s)',
        async (enabled) => {
            const incomplete = githubPackage()
            incomplete.id = 'incomplete-package'
            incomplete.organizationId = scope.organizationId
            incomplete.descriptor.name = 'incomplete'
            incomplete.descriptor.servers = []
            incomplete.descriptor.diagnostics = [
                { component: 'mcp', code: 'invalid_server', message: 'Invalid server' }
            ]
            packages.items.push(incomplete)
            bindings.items.push({ ...importedPluginBinding(incomplete), enabled })

            const api = await replica()
            expect((await api.definitions(workspaceId)).map((item) => item.provider)).toEqual([githubProvider])
            await expect(
                api.createBinding({
                    provider: githubProvider,
                    authorizationMode: 'shared',
                    scope: { type: 'workspace', workspaceId }
                })
            ).resolves.toMatchObject({ provider: githubProvider, status: 'disconnected' })
        }
    )

    it.each(['active', 'superseded', 'equivalent URL history', 'native provider registered'])(
        'connects and completes OAuth and runtime access on cold replicas (%s)',
        async (history) => {
            if (history === 'equivalent URL history') {
                packages.items[0].descriptor.servers[0].config.url = 'https://API.GITHUBCOPILOT.COM:443/mcp/'
            }
            const json = (body: object) =>
                new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
            jest.mocked(guardedOAuthFetch).mockImplementation(async (url) => {
                const target = String(url)
                if (target.includes('api.githubcopilot.com/.well-known/oauth-protected-resource'))
                    return json({
                        resource: githubConfig.serverUrl,
                        authorization_servers: ['https://auth.example.test']
                    })
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
                    return json({
                        client_id: 'test-client',
                        redirect_uris: ['https://xpert.example.test/api/connector/oauth/callback']
                    })
                if (target.endsWith('/token'))
                    return json({ access_token: 'test-access', token_type: 'Bearer', expires_in: 3600 })
                return new Response('', { status: 404 })
            })
            const api = await replica()
            if (history === 'equivalent URL history') {
                // One replica was warmed by an install of the older URL spelling.
                replicas[0]
                    .get(AgentPluginConnectorService)
                    .register(
                        packages.items[0],
                        packages.items[0].descriptor.extension.connectors,
                        scope.organizationId
                    )
            }
            const started = await api.connect(workspaceId, githubProvider, {
                redirectUri: 'https://xpert.example.test/api/connector/oauth/callback'
            })
            expect(started.status).toBe('pending')
            if (started.status !== 'pending') throw new Error('Expected OAuth authorization')
            const state = new URL(started.authorizationUrl).searchParams.get('state')

            if (history === 'superseded' || history === 'equivalent URL history') {
                const old = importedPluginBinding(packages.items[0])
                bindings.items.push({ ...old, enabled: false, supersededById: 'replacement' })
                const replacement = githubPackage()
                replacement.id = 'replacement-package'
                if (history === 'superseded') {
                    replacement.descriptor.servers[0].config.url = 'https://new.example.test/mcp'
                }
                packages.items.push(replacement)
                bindings.items.unshift({ ...importedPluginBinding(replacement), id: 'replacement', enabled: false })
                expect(await api.definitions(workspaceId)).toEqual([])
            }

            if (history === 'equivalent URL history') await replicas.shift().close()
            const callbackApi = await replica()
            const native = {
                definition: {
                    provider: 'github',
                    label: 'GitHub',
                    mcpOAuthResources: [githubConfig.serverUrl],
                    authMethods: [{ id: 'pat', type: 'api_key' as const, label: 'PAT', credentials: { fields: [] } }]
                },
                connect: jest.fn(),
                exchangeAuthorizationCode: jest.fn(),
                resolveRuntimeCredential: jest.fn()
            }
            if (history === 'native provider registered')
                replicas[replicas.length - 1]
                    .get(ConnectorStrategyRegistry)
                    .register('github', native, { kind: 'builtin', scopeKey: scope.organizationId })
            // Callback identity comes from the stored OAuth session, not the ambient request.
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(undefined)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
            await expect(callbackApi.completeOAuthCallback({ state, code: 'test-code' })).resolves.toMatchObject({
                provider: githubProvider,
                status: 'active'
            })
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)

            if (history === 'equivalent URL history') await replicas.shift().close()
            const runtimeApi = await replica()
            if (history === 'native provider registered')
                replicas[replicas.length - 1]
                    .get(ConnectorStrategyRegistry)
                    .register('github', native, { kind: 'builtin', scopeKey: scope.organizationId })
            expect(native.exchangeAuthorizationCode).not.toHaveBeenCalled()
            const reference = { bindingId: started.connector.id, provider: githubProvider }
            await expect(runtimeApi.runtimeOptions('assistant')).resolves.toMatchObject({
                items: [expect.objectContaining({ ...reference, status: 'active', granted: true })]
            })
            await expect(
                runtimeApi.getRuntimeConnectorCredentialForScope(reference, {
                    ...scope,
                    userId: 'user',
                    xpertId: 'assistant',
                    conversationId: 'conversation',
                    executionId: 'execution',
                    connectorBindingIds: [reference.bindingId]
                })
            ).resolves.toMatchObject({
                ...reference,
                credentials: { accessToken: 'test-access', resource: githubConfig.serverUrl }
            })
            const provider = connectorMcpProvider(
                () =>
                    runtimeApi.getRuntimeConnectorCredentialForScope(reference, {
                        ...scope,
                        userId: 'user',
                        xpertId: 'assistant',
                        conversationId: 'conversation',
                        executionId: 'execution',
                        connectorBindingIds: [reference.bindingId]
                    }),
                { provider: githubProvider, serverUrl: githubConfig.serverUrl }
            )
            await expect(provider.tokens()).resolves.toMatchObject({ access_token: 'test-access' })
            await expect(
                runtimeApi.getRuntimeConnectorCredentialForScope(reference, {
                    ...scope,
                    userId: 'user',
                    xpertId: 'assistant',
                    conversationId: 'conversation',
                    executionId: 'execution',
                    connectorBindingIds: []
                })
            ).rejects.toBeInstanceOf(ForbiddenException)
        }
    )
})

// Persisted state is shared between replicas; their registries and CQRS containers are not.
class MemoryRepository<T extends { id?: string }> {
    constructor(readonly items: T[] = []) {}

    create(input: Partial<T>): T {
        return input as T
    }

    async find(options?: { where?: object | object[] }): Promise<T[]> {
        if (!options?.where) return [...this.items]
        const clauses = Array.isArray(options.where) ? options.where : [options.where]
        return this.items.filter((item) => clauses.some((where) => matches(item, where)))
    }

    async findOne(options: { where: object }) {
        return (await this.find(options))[0] ?? null
    }

    async findOneBy(where: object) {
        return this.findOne({ where })
    }

    async save(item: T) {
        item.id ??= `id-${this.items.length + 1}`
        const index = this.items.findIndex((current) => current.id === item.id)
        if (index < 0) this.items.push(item)
        else this.items[index] = item
        return item
    }

    async update(where: object, patch: Partial<T>) {
        const items = this.items.filter((item) => matches(item, where))
        items.forEach((item) => Object.assign(item, patch))
        return { affected: items.length }
    }
}

function matches(item: object, where: object) {
    return Object.entries(where).every(([key, expected]) => {
        const actual: unknown = Reflect.get(item, key)
        return expected instanceof FindOperator && expected.type === 'isNull' ? actual == null : actual === expected
    })
}
