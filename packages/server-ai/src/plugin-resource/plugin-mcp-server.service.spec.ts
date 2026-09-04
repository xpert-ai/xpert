jest.mock('./plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class PluginResourceInstallerService {}
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    describeXpertToolProvider: jest.fn(() => ({
        options: {
            provider: 'decorated',
            componentKey: 'decorated-tools',
            name: 'Decorated tools',
            slug: 'legacy-client-specific-slug',
            defaultMiddleware: 'decorated',
            middlewares: [{ provider: 'decorated', meta: {} }]
        },
        tools: [{ propertyKey: 'read', options: { mcp: {} }, middlewareProvider: null }]
    }))
}))
jest.mock('./plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))
jest.mock('../mcp-publication/mcp-api-key.service', () => ({ McpApiKeyService: class McpApiKeyService {} }))
jest.mock('../mcp-publication/mcp-capability-catalog.service', () => ({
    McpCapabilityCatalogService: class McpCapabilityCatalogService {}
}))
jest.mock('../mcp-publication/mcp-publication.service', () => ({
    McpPublicationService: class McpPublicationService {}
}))
jest.mock('../mcp-publication/mcp-publication-access.service', () => ({
    McpPublicationAccessService: class McpPublicationAccessService {}
}))
jest.mock('../mcp-publication/entities/mcp-publication.entity', () => ({
    McpPublication: class McpPublication {}
}))
jest.mock('../mcp-publication/mcp-publication-runtime.service', () => ({
    mcpCapabilityProviderInstructions: jest.fn(() => undefined),
    mcpPublicationInstructions: jest.fn((instructions: string | undefined) => instructions)
}))

let mockOrganizationId: string | null = 'org-1'

jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        RequestContext: {
            getOrganizationId: jest.fn(() => mockOrganizationId),
            currentTenantId: jest.fn(() => 'tenant-1'),
            getScope: jest.fn(() => ({ tenantId: 'tenant-1', organizationId: mockOrganizationId })),
            currentRequest: jest.fn(() => null),
            currentUser: jest.fn(() => ({ id: 'user-1', tenantId: 'tenant-1' })),
            getLanguageCode: jest.fn(() => 'en-US')
        }
    }
})

jest.mock('../shared/request-context', () => ({
    captureRequestContext: jest.fn((context) => context),
    runWithCapturedRequestContext: jest.fn(async (context, task) => {
        const previous = mockOrganizationId
        mockOrganizationId = context.organizationId ?? null
        try {
            return await task()
        } finally {
            mockOrganizationId = previous
        }
    })
}))

import { StrategyBus } from '@xpert-ai/plugin-sdk'
import { PluginMcpServerService } from './plugin-mcp-server.service'

describe('PluginMcpServerService', () => {
    beforeEach(() => {
        mockOrganizationId = 'org-1'
    })

    it('adopts a stable Publication, synchronizes every Tool, and only returns a newly created secret once', async () => {
        const installation = {
            id: 'installation-1',
            tenantId: 'tenant-1',
            organizationId: null,
            pluginName: '@xpert-ai/plugin-decorated',
            componentType: 'toolset',
            componentKey: 'decorated-tools',
            runtimeId: 'toolset-1',
            enabled: true,
            status: 'ready',
            definitionHash: 'hash-1',
            config: {
                provider: 'decorated',
                name: 'Decorated tools',
                slug: 'decorated-tools-mcp'
            }
        }
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getOne: jest.fn().mockResolvedValue(null)
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const installationRepo = {
            createQueryBuilder: jest.fn(() => queryBuilder),
            save: jest.fn(async (value) => value)
        }
        let installCount = 0
        const providerScopes: Array<string | null> = []
        const installer = {
            installRegisteredRuntimeToolProviderToOrganization: jest.fn(async () => {
                installCount += 1
                providerScopes.push(mockOrganizationId)
                return {
                    installation,
                    previousInstallation: installCount === 1 ? null : { ...installation },
                    previousToolset: null
                }
            }),
            rollbackRegisteredRuntimeToolProviderInstallation: jest.fn()
        }
        const capabilities = [
            { toolsetId: 'toolset-1', capabilityType: 'tool', capabilityKey: 'read_data' },
            { toolsetId: 'toolset-1', capabilityType: 'tool', capabilityKey: 'write_data' }
        ]
        const catalog = {
            getToolsetCapabilitySnapshot: jest.fn(async () => []),
            discoverMcpToolsetCapabilities: jest.fn(async () => capabilities),
            restoreToolsetCapabilitySnapshot: jest.fn()
        }
        const publication = {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Decorated tools',
            slug: '',
            status: 'draft',
            authMethods: ['api_key'],
            protocolVersion: '2026-07-28',
            instructions: null,
            reviewStatus: 'current',
            reviewReason: null,
            reviewedAt: null,
            reviewedById: null,
            capabilities: [
                {
                    capabilityType: 'tool',
                    capabilityKey: 'read_data',
                    publicName: 'custom_read',
                    enabled: false,
                    policy: { approvalMode: 'deny' }
                }
            ]
        }
        const publications = {
            findManagedBySlug: jest.fn(async (slug: string) => {
                publication.slug = slug
                return publication
            }),
            create: jest.fn(),
            getManaged: jest.fn(async () => publication),
            synchronizeManagedSlug: jest.fn(async (_id: string, slug: string) => {
                publication.slug = slug
                return publication
            }),
            replaceCapabilitiesWithCatalog: jest.fn(async () => undefined),
            enable: jest.fn(async () => ({ ...publication, status: 'active' })),
            disable: jest.fn(async () => ({ ...publication, status: 'disabled' })),
            replaceCapabilities: jest.fn(),
            restoreManagedState: jest.fn(),
            discardManaged: jest.fn(),
            resolveRuntimeCapabilities: jest.fn(async () => [])
        }
        const apiKeys = {
            listForOrganization: jest
                .fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    {
                        id: 'key-1',
                        revokedAt: null,
                        expiresAt: null,
                        scopes: ['tools:list', 'tools:call']
                    }
                ]),
            createRevealableForOrganization: jest.fn(async () => ({
                apiKey: { id: 'key-1' },
                secret: 'one-time-secret'
            }))
        }
        const publicationAccess = {
            enable: jest.fn(),
            disable: jest.fn(),
            assertEnabled: jest.fn(),
            isEnabled: jest.fn(async () => false)
        }
        const provider = {}
        const providerRegistry = {
            listRegistrations: jest.fn(() => [
                {
                    strategy: provider,
                    source: {
                        kind: 'plugin',
                        pluginName: '@xpert-ai/plugin-decorated',
                        scopeKey: 'tenant:tenant-1:global'
                    }
                }
            ]),
            getSource: jest.fn()
        }
        const service = new PluginMcpServerService(
            installationRepo as never,
            installer as never,
            catalog as never,
            publications as never,
            apiKeys as never,
            publicationAccess as never,
            { get: jest.fn(() => 'http://localhost:3000') } as never,
            new StrategyBus(),
            providerRegistry as never,
            [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'global',
                    scopeKey: 'tenant:tenant-1:global',
                    name: '@xpert-ai/plugin-decorated',
                    packageName: '@xpert-ai/plugin-decorated',
                    level: 'tenant',
                    instance: { meta: { artifactNamespace: 'acme_factory' } }
                }
            ] as never
        )

        const first = await service.enable('@xpert-ai/plugin-decorated', 'decorated-tools')
        publication.status = 'active'
        publication.slug = 'legacy-client-specific-slug'
        installation.config = first.installation.config as typeof installation.config
        queryBuilder.getOne.mockResolvedValue(installation)
        const second = await service.enable('@xpert-ai/plugin-decorated', 'decorated-tools')

        const managedSlug = publications.findManagedBySlug.mock.calls[0][0]
        expect(managedSlug).toMatch(/^acme-factory-decorated-t-[a-f0-9]{12}$/)
        expect(managedSlug).not.toContain('tenant-1')
        expect(managedSlug).not.toContain('org-1')
        expect(publications.create).not.toHaveBeenCalled()
        expect(publications.synchronizeManagedSlug).toHaveBeenCalledWith('publication-1', managedSlug)
        expect(publications.replaceCapabilitiesWithCatalog).toHaveBeenNthCalledWith(1, 'publication-1', capabilities, [
            expect.objectContaining({
                capabilityKey: 'read_data',
                publicName: 'custom_read',
                enabled: false,
                policy: { approvalMode: 'deny' }
            }),
            expect.objectContaining({
                capabilityKey: 'write_data',
                publicName: 'write_data',
                enabled: true,
                policy: null
            })
        ])
        expect(first.createdApiKey?.secret).toBe('one-time-secret')
        expect(first.connectionInfo.endpoint).toBe(`http://localhost:3000/api/mcp/p/${managedSlug}`)
        expect(second.createdApiKey).toBeUndefined()
        expect(apiKeys.createRevealableForOrganization).toHaveBeenCalledTimes(1)
        expect(apiKeys.createRevealableForOrganization).toHaveBeenCalledWith(publication, 'org-1', expect.any(Object))
        expect(publicationAccess.enable).toHaveBeenCalledTimes(2)
        expect(installer.installRegisteredRuntimeToolProviderToOrganization).toHaveBeenCalledWith({
            pluginName: '@xpert-ai/plugin-decorated',
            componentKey: 'decorated-tools',
            provider: 'decorated',
            sourceScopeKey: 'tenant:tenant-1:global'
        })
        expect(providerScopes).toEqual([null, null])
        expect(installation.config).toMatchObject({
            artifactNamespace: 'acme_factory',
            provider: 'decorated',
            pluginLevel: 'tenant',
            publicationScope: 'tenant'
        })
    })

    it('disables only the current organization grant for a tenant plugin', async () => {
        const installation = {
            pluginName: '@xpert-ai/plugin-decorated',
            componentType: 'toolset',
            componentKey: 'decorated-tools',
            enabled: true,
            config: { publicationId: 'publication-1' }
        }
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getOne: jest.fn(async () => installation)
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const publication = {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            status: 'active'
        }
        const publications = {
            getManaged: jest.fn(async () => publication),
            disable: jest.fn(async () => undefined)
        }
        const publicationAccess = { disable: jest.fn(async () => undefined) }
        const service = new PluginMcpServerService(
            {
                createQueryBuilder: jest.fn(() => queryBuilder),
                save: jest.fn(async (value) => value)
            } as never,
            {} as never,
            {} as never,
            publications as never,
            {} as never,
            publicationAccess as never,
            {} as never,
            new StrategyBus(),
            {
                listRegistrations: jest.fn(() => [
                    {
                        strategy: {},
                        source: {
                            kind: 'plugin',
                            pluginName: '@xpert-ai/plugin-decorated',
                            scopeKey: 'tenant:tenant-1:global'
                        }
                    }
                ])
            } as never,
            [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'global',
                    scopeKey: 'tenant:tenant-1:global',
                    name: '@xpert-ai/plugin-decorated',
                    level: 'tenant',
                    instance: { meta: { artifactNamespace: 'acme_factory' } }
                }
            ] as never
        )

        await service.disable('@xpert-ai/plugin-decorated', 'decorated-tools')

        expect(publicationAccess.disable).toHaveBeenCalledWith(publication, 'org-1')
        expect(publications.disable).not.toHaveBeenCalled()
        expect(installation.enabled).toBe(true)
    })

    it('compensates a partially prepared Toolset, catalog, and Publication when activation fails', async () => {
        const installation = {
            id: 'installation-new',
            tenantId: 'tenant-1',
            organizationId: null,
            pluginName: '@xpert-ai/plugin-decorated',
            componentType: 'toolset',
            componentKey: 'decorated-tools',
            runtimeId: 'toolset-new',
            enabled: true,
            status: 'ready',
            definitionHash: 'hash-new',
            config: { provider: 'decorated', name: 'Decorated tools' }
        }
        const installationRepo = {
            createQueryBuilder: jest.fn(),
            save: jest.fn(async () => {
                throw new Error('installation commit failed')
            })
        }
        const installer = {
            installRegisteredRuntimeToolProviderToOrganization: jest.fn(async () => ({
                installation,
                previousInstallation: null,
                previousToolset: null
            })),
            rollbackRegisteredRuntimeToolProviderInstallation: jest.fn(async () => undefined)
        }
        const capabilities = [{ toolsetId: 'toolset-new', capabilityType: 'tool', capabilityKey: 'read_data' }]
        const catalog = {
            getToolsetCapabilitySnapshot: jest.fn(async () => []),
            discoverMcpToolsetCapabilities: jest.fn(async () => capabilities),
            restoreToolsetCapabilitySnapshot: jest.fn(async () => undefined)
        }
        const publication = {
            id: 'publication-new',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Decorated tools',
            slug: 'acme-factory-decorated-t-000000000000',
            status: 'draft',
            authMethods: ['api_key'],
            protocolVersion: '2026-07-28',
            instructions: null,
            reviewStatus: 'current',
            reviewReason: null,
            reviewedAt: null,
            reviewedById: null,
            capabilities: []
        }
        const publications = {
            findManagedBySlug: jest.fn(async () => null),
            create: jest.fn(async () => publication),
            getManaged: jest.fn(async () => publication),
            replaceCapabilitiesWithCatalog: jest.fn(async () => undefined),
            enable: jest.fn(async () => ({ ...publication, status: 'active' })),
            discardManaged: jest.fn(async () => undefined),
            replaceCapabilities: jest.fn(),
            restoreManagedState: jest.fn()
        }
        const publicationAccess = {
            isEnabled: jest.fn(),
            enable: jest.fn(),
            disable: jest.fn()
        }
        const service = new PluginMcpServerService(
            installationRepo as never,
            installer as never,
            catalog as never,
            publications as never,
            {} as never,
            publicationAccess as never,
            {} as never,
            new StrategyBus(),
            {
                listRegistrations: jest.fn(() => [
                    {
                        strategy: {},
                        source: {
                            kind: 'plugin',
                            pluginName: '@xpert-ai/plugin-decorated',
                            scopeKey: 'tenant:tenant-1:global'
                        }
                    }
                ])
            } as never,
            [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'global',
                    scopeKey: 'tenant:tenant-1:global',
                    name: '@xpert-ai/plugin-decorated',
                    level: 'tenant',
                    instance: { meta: { artifactNamespace: 'acme_factory' } }
                }
            ] as never
        )

        await expect(service.enable('@xpert-ai/plugin-decorated', 'decorated-tools')).rejects.toThrow(
            'installation commit failed'
        )

        expect(catalog.restoreToolsetCapabilitySnapshot).toHaveBeenCalledWith('toolset-new', [])
        expect(publications.discardManaged).toHaveBeenCalledWith('publication-new')
        expect(installer.rollbackRegisteredRuntimeToolProviderInstallation).toHaveBeenCalledWith(
            expect.objectContaining({ installation })
        )
        expect(publicationAccess.enable).not.toHaveBeenCalled()
    })

    it('disables the dedicated Publication when the provider belongs to an organization plugin', async () => {
        const installation = {
            pluginName: '@xpert-ai/plugin-decorated',
            componentType: 'toolset',
            componentKey: 'decorated-tools',
            enabled: true,
            config: { publicationId: 'publication-organization-1' }
        }
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getOne: jest.fn(async () => installation)
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const publication = {
            id: 'publication-organization-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            status: 'active'
        }
        const publications = {
            getManaged: jest.fn(async () => publication),
            disable: jest.fn(async () => undefined)
        }
        const publicationAccess = { disable: jest.fn() }
        const service = new PluginMcpServerService(
            {
                createQueryBuilder: jest.fn(() => queryBuilder),
                save: jest.fn(async (value) => value)
            } as never,
            {} as never,
            {} as never,
            publications as never,
            {} as never,
            publicationAccess as never,
            {} as never,
            new StrategyBus(),
            {
                listRegistrations: jest.fn(() => [
                    {
                        strategy: {},
                        source: {
                            kind: 'plugin',
                            pluginName: '@xpert-ai/plugin-decorated',
                            scopeKey: 'org-1'
                        }
                    }
                ])
            } as never,
            [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    scopeKey: 'org-1',
                    name: '@xpert-ai/plugin-decorated',
                    level: 'organization',
                    instance: { meta: { artifactNamespace: 'acme_factory' } }
                }
            ] as never
        )

        await service.disable('@xpert-ai/plugin-decorated', 'decorated-tools')

        expect(publications.disable).toHaveBeenCalledWith('publication-organization-1')
        expect(publicationAccess.disable).not.toHaveBeenCalled()
        expect(installation.enabled).toBe(false)
    })

    it('returns a repeatable credential scoped to the requesting organization', async () => {
        const publication = {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            status: 'active'
        }
        const installation = { config: { name: 'Decorated tools' } }
        const apiKeys = {
            getOrCreateRevealableCredential: jest.fn(async () => ({
                apiKey: { id: 'key-1', organizationId: 'org-1' },
                secret: 'repeatable-secret'
            }))
        }
        const publications = {
            getManaged: jest.fn(async () => ({ ...publication, capabilities: [] })),
            resolveRuntimeCapabilities: jest.fn(async () => [])
        }
        const service = new PluginMcpServerService(
            {} as never,
            {} as never,
            {} as never,
            publications as never,
            apiKeys as never,
            { assertEnabled: jest.fn() } as never,
            {} as never,
            new StrategyBus(),
            {} as never,
            []
        )
        const ownership = {
            level: 'organization',
            organizationId: 'org-1',
            tenantId: 'tenant-1'
        }
        Reflect.set(
            service,
            'resolveProviderOwnership',
            jest.fn(() => ownership)
        )
        Reflect.set(
            service,
            'requireProviderPublication',
            jest.fn(async () => ({ publication, installation }))
        )
        Reflect.set(
            service,
            'connectionInfoFor',
            jest.fn(async () => ({
                protocolVersion: '2026-07-28',
                transport: 'streamable-http',
                endpoint: 'http://localhost:3000/api/mcp/p/decorated',
                authorization: 'Bearer'
            }))
        )
        Reflect.set(
            service,
            'runInProviderScope',
            jest.fn((_ownership: unknown, task: () => Promise<unknown>) => task())
        )

        const result = await service.credential('@xpert-ai/plugin-decorated', 'decorated-tools')

        expect(apiKeys.getOrCreateRevealableCredential).toHaveBeenCalledWith(publication, 'org-1', {
            name: 'Decorated tools MCP client',
            scopes: ['tools:list', 'tools:call']
        })
        expect(result).toEqual(
            expect.objectContaining({
                secret: 'repeatable-secret',
                connectionInfo: expect.objectContaining({ endpoint: 'http://localhost:3000/api/mcp/p/decorated' })
            })
        )
    })

    it('adds Resource scopes to repeatable credentials for Providers with MCP Apps', async () => {
        const publication = {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            status: 'active'
        }
        const installation = { config: { name: 'Decorated tools' } }
        const apiKeys = {
            getOrCreateRevealableCredential: jest.fn(async () => ({
                apiKey: { id: 'key-1', organizationId: 'org-1' },
                secret: 'repeatable-secret'
            }))
        }
        const publications = {
            getManaged: jest.fn(async () => ({ ...publication, capabilities: [] })),
            resolveRuntimeCapabilities: jest.fn(async () => [{ capabilityType: 'tool' }, { capabilityType: 'app' }])
        }
        const service = new PluginMcpServerService(
            {} as never,
            {} as never,
            {} as never,
            publications as never,
            apiKeys as never,
            { assertEnabled: jest.fn() } as never,
            {} as never,
            new StrategyBus(),
            {} as never,
            []
        )
        const ownership = {
            level: 'organization',
            organizationId: 'org-1',
            tenantId: 'tenant-1'
        }
        Reflect.set(
            service,
            'resolveProviderOwnership',
            jest.fn(() => ownership)
        )
        Reflect.set(
            service,
            'requireProviderPublication',
            jest.fn(async () => ({ publication, installation }))
        )
        Reflect.set(
            service,
            'connectionInfoFor',
            jest.fn(async () => ({}))
        )
        Reflect.set(
            service,
            'runInProviderScope',
            jest.fn((_ownership: unknown, task: () => Promise<unknown>) => task())
        )

        await service.credential('@xpert-ai/plugin-decorated', 'decorated-tools')

        expect(apiKeys.getOrCreateRevealableCredential).toHaveBeenCalledWith(publication, 'org-1', {
            name: 'Decorated tools MCP client',
            scopes: ['tools:list', 'tools:call', 'resources:list', 'resources:read']
        })
    })

    it('disables the tenant Publication and every legacy organization Publication on uninstall', async () => {
        const installations = [
            {
                id: 'installation-tenant',
                tenantId: 'tenant-1',
                organizationId: null,
                enabled: true,
                config: { publicationId: 'publication-tenant', publicationScope: 'tenant' }
            },
            {
                id: 'installation-org-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true,
                config: { publicationId: 'publication-org-1' }
            },
            {
                id: 'installation-org-2',
                tenantId: 'tenant-1',
                organizationId: 'org-2',
                enabled: true,
                config: { publicationId: 'publication-org-2' }
            }
        ]
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getMany: jest.fn(async () => installations)
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const disabledScopes: Array<{ publicationId: string; organizationId: string | null }> = []
        const publications = {
            disable: jest.fn(async (publicationId: string) => {
                disabledScopes.push({ publicationId, organizationId: mockOrganizationId })
            })
        }
        const installationRepo = {
            createQueryBuilder: jest.fn(() => queryBuilder),
            save: jest.fn(async (value) => value)
        }
        const service = new PluginMcpServerService(
            installationRepo as never,
            {} as never,
            {} as never,
            publications as never,
            {} as never,
            {} as never,
            {} as never,
            new StrategyBus(),
            {} as never,
            [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'global',
                    scopeKey: 'tenant:tenant-1:global',
                    name: '@xpert-ai/plugin-decorated',
                    level: 'tenant',
                    instance: { meta: { artifactNamespace: 'acme_factory' } }
                }
            ] as never
        )

        await service.disableInstalledServers('@xpert-ai/plugin-decorated', 'tenant:tenant-1:global')

        expect(disabledScopes).toEqual([
            { publicationId: 'publication-tenant', organizationId: null },
            { publicationId: 'publication-org-1', organizationId: 'org-1' },
            { publicationId: 'publication-org-2', organizationId: 'org-2' }
        ])
        expect(installations.every((installation) => !installation.enabled)).toBe(true)
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('installation.tenantId = :tenantId', {
            tenantId: 'tenant-1'
        })
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
            'installation.organizationId = :organizationId',
            expect.anything()
        )
    })

    it('captures plugin scope before the loader removes its runtime record', async () => {
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getMany: jest.fn(async () => [
                {
                    tenantId: 'tenant-1',
                    organizationId: null,
                    enabled: true,
                    config: { publicationId: 'publication-tenant', publicationScope: 'tenant' }
                }
            ])
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const strategyBus = new StrategyBus()
        const loadedPlugins = [
            {
                tenantId: 'tenant-1',
                organizationId: 'global',
                scopeKey: 'tenant:tenant-1:global',
                name: '@xpert-ai/plugin-decorated',
                level: 'tenant',
                instance: { meta: { artifactNamespace: 'acme_factory' } }
            }
        ]
        const publications = { disable: jest.fn(async () => undefined) }
        const service = new PluginMcpServerService(
            {
                createQueryBuilder: jest.fn(() => queryBuilder),
                save: jest.fn(async (value) => value)
            } as never,
            {} as never,
            {} as never,
            publications as never,
            {} as never,
            {} as never,
            {} as never,
            strategyBus,
            { listRegistrations: jest.fn(() => []) } as never,
            loadedPlugins as never
        )
        service.onModuleInit()

        strategyBus.remove('tenant:tenant-1:global', '@xpert-ai/plugin-decorated', 'uninstall')
        loadedPlugins.splice(0)
        await new Promise<void>((resolve) => queueMicrotask(resolve))
        await new Promise<void>((resolve) => queueMicrotask(resolve))

        expect(publications.disable).toHaveBeenCalledWith('publication-tenant')
        service.onModuleDestroy()
    })

    it('reconciles enabled Providers after all modules finish initialization', async () => {
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getMany: jest.fn(async () => [
                {
                    tenantId: 'tenant-1',
                    organizationId: null
                }
            ])
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const installationRepo = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const providerRegistry = {
            listAllRegistrations: jest.fn(() => [
                {
                    strategy: {},
                    source: {
                        kind: 'plugin',
                        pluginName: '@xpert-ai/plugin-decorated',
                        scopeKey: 'tenant:tenant-1:global'
                    }
                }
            ])
        }
        const service = new PluginMcpServerService(
            installationRepo as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            new StrategyBus(),
            providerRegistry as never,
            [
                {
                    tenantId: 'tenant-1',
                    scopeKey: 'tenant:tenant-1:global',
                    name: '@xpert-ai/plugin-decorated',
                    level: 'tenant',
                    instance: { meta: { artifactNamespace: 'acme_factory' } }
                }
            ] as never
        )
        const synchronizeEnabled = jest.spyOn(service, 'synchronizeEnabled').mockResolvedValue(undefined)

        service.onModuleInit()
        service.onApplicationBootstrap()
        await new Promise<void>((resolve) => queueMicrotask(resolve))

        expect(synchronizeEnabled).toHaveBeenCalledWith(
            '@xpert-ai/plugin-decorated',
            'decorated-tools',
            'tenant:tenant-1:global',
            { tenantId: 'tenant-1', organizationId: null }
        )
        service.onModuleDestroy()
    })

    it.each([
        ['active', true],
        ['disabled', false]
    ] as const)(
        'reconciles a legacy disabled installation only when its Publication is %s',
        async (publicationStatus, shouldActivate) => {
            const publications = {
                getManaged: jest.fn(async () => ({ id: 'publication-1', status: publicationStatus }))
            }
            const service = new PluginMcpServerService(
                {} as never,
                {} as never,
                {} as never,
                publications as never,
                {} as never,
                {} as never,
                {} as never,
                new StrategyBus(),
                {} as never,
                []
            )
            const ownership = { tenantId: 'tenant-1', organizationId: null }
            Reflect.set(
                service,
                'resolveProviderOwnership',
                jest.fn(() => ownership)
            )
            Reflect.set(
                service,
                'findInstallation',
                jest.fn(async () => ({ enabled: false, config: { publicationId: 'publication-1' } }))
            )
            Reflect.set(
                service,
                'runInProviderScope',
                jest.fn((_ownership: unknown, task: () => Promise<unknown>) => task())
            )
            const activateProvider = jest.fn(async () => ({}))
            Reflect.set(service, 'activateProvider', activateProvider)

            await service.synchronizeEnabled('@xpert-ai/plugin-decorated', 'decorated-tools')

            expect(activateProvider).toHaveBeenCalledTimes(shouldActivate ? 1 : 0)
        }
    )
})
