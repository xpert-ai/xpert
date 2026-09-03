import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { environment } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/server-core'
import { In, IsNull, type Repository } from 'typeorm'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import {
    McpApiKey,
    McpCapabilityCatalog,
    McpInvocationAudit,
    McpOAuthPolicy,
    McpPublication,
    McpPublicationCapability
} from './entities'
import { McpPublicationService } from './mcp-publication.service'
import { McpPublicationAccessService } from './mcp-publication-access.service'
import { McpSubscriptionService } from './mcp-subscription.service'

const defaultMcpOAuthEnabled = environment.mcpOAuthEnabled

beforeEach(() => {
    environment.mcpOAuthEnabled = true
    jest.spyOn(RequestContext, 'getScope').mockReturnValue({
        tenantId: 'tenant-1',
        organizationId: null
    } as ReturnType<typeof RequestContext.getScope>)
})

afterEach(() => {
    environment.mcpOAuthEnabled = defaultMcpOAuthEnabled
    jest.restoreAllMocks()
})

describe('McpPublicationService list summaries', () => {
    it('returns the management-card projection in one request', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: '10000000-0000-4000-8000-000000000001',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Generic MCP',
            slug: 'generic-mcp'
        })
        const capabilityBuilder = rawBuilder([{ publicationId: publication.id, count: '3' }])
        const apiKeyBuilder = rawBuilder([{ publicationId: publication.id, count: '2' }])
        const recentInvocationAt = new Date('2026-08-20T01:00:00.000Z')
        const recentErrorAt = new Date('2026-08-20T00:30:00.000Z')
        const auditBuilder = rawBuilder([{ publicationId: publication.id, recentInvocationAt, recentErrorAt }])
        const service = new McpPublicationService(
            repository<McpPublication>({ find: jest.fn().mockResolvedValue([publication]) }),
            repository<McpPublicationCapability>({ createQueryBuilder: jest.fn(() => capabilityBuilder) }),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>({ createQueryBuilder: jest.fn(() => apiKeyBuilder) }),
            repository<McpOAuthPolicy>({
                find: jest.fn().mockResolvedValue([{ publicationId: publication.id, enabled: true }])
            }),
            repository<McpInvocationAudit>({ createQueryBuilder: jest.fn(() => auditBuilder) }),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.list()).resolves.toEqual([
            expect.objectContaining({
                id: publication.id,
                capabilityCount: 3,
                apiKeyCount: 2,
                oauthEnabled: true,
                recentInvocationAt,
                recentErrorAt
            })
        ])
        expect(apiKeyBuilder.andWhere).toHaveBeenCalledWith('apiKey.revokedAt IS NULL')
        expect(apiKeyBuilder.andWhere).toHaveBeenCalledWith(
            '(apiKey.expiresAt IS NULL OR apiKey.expiresAt > CURRENT_TIMESTAMP)'
        )
    })

    it('does not issue aggregate queries for an empty management scope', async () => {
        const capabilityRepository = repository<McpPublicationCapability>({
            createQueryBuilder: jest.fn()
        })
        const service = new McpPublicationService(
            repository<McpPublication>({ find: jest.fn().mockResolvedValue([]) }),
            capabilityRepository,
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.list()).resolves.toEqual([])
        expect(capabilityRepository.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('includes admitted tenant Publications in an organization scope with organization-local health', async () => {
        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        } as ReturnType<typeof RequestContext.getScope>)
        const organizationPublication = Object.assign(new McpPublication(), {
            id: '10000000-0000-4000-8000-000000000001',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            name: 'Organization MCP',
            slug: 'organization-mcp',
            status: 'active'
        })
        const sharedPublication = Object.assign(new McpPublication(), {
            id: '10000000-0000-4000-8000-000000000002',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Plugin MCP',
            slug: 'plugin-mcp',
            status: 'active'
        })
        const find = jest
            .fn()
            .mockResolvedValueOnce([organizationPublication])
            .mockResolvedValueOnce([sharedPublication])
        const capabilityBuilder = rawBuilder([
            { publicationId: organizationPublication.id, count: '1' },
            { publicationId: sharedPublication.id, count: '5' }
        ])
        const apiKeyBuilder = rawBuilder([{ publicationId: sharedPublication.id, count: '1' }])
        const auditBuilder = rawBuilder([])
        const service = new McpPublicationService(
            repository<McpPublication>({ find }),
            repository<McpPublicationCapability>({ createQueryBuilder: jest.fn(() => capabilityBuilder) }),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>({ createQueryBuilder: jest.fn(() => apiKeyBuilder) }),
            repository<McpOAuthPolicy>({ find: jest.fn().mockResolvedValue([]) }),
            repository<McpInvocationAudit>({ createQueryBuilder: jest.fn(() => auditBuilder) }),
            {} as unknown as McpSubscriptionService,
            accessService({
                listConfigured: jest.fn().mockResolvedValue([
                    {
                        publicationId: sharedPublication.id,
                        tenantId: 'tenant-1',
                        organizationId: 'organization-1',
                        enabled: true
                    }
                ])
            })
        )

        await expect(service.list()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: sharedPublication.id,
                    status: 'active',
                    publicationScope: 'tenant',
                    organizationAccessEnabled: true,
                    capabilityCount: 5,
                    apiKeyCount: 1
                })
            ])
        )
        expect(apiKeyBuilder.andWhere).toHaveBeenCalledWith('apiKey.organizationId = :organizationId', {
            organizationId: 'organization-1'
        })
        expect(auditBuilder.andWhere).toHaveBeenCalledWith('audit.organizationId = :organizationId', {
            organizationId: 'organization-1'
        })
    })
})

describe('McpPublicationService shared organization management', () => {
    it('resolves an admitted tenant Publication and toggles only the current organization access', async () => {
        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        } as ReturnType<typeof RequestContext.getScope>)
        const publication = Object.assign(new McpPublication(), {
            id: '10000000-0000-4000-8000-000000000002',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Plugin MCP',
            slug: 'plugin-mcp',
            status: 'active',
            reviewStatus: 'current',
            authMethods: ['api_key']
        })
        const publicationRepository = repository<McpPublication>({
            findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(publication),
            save: jest.fn(async (value) => value)
        })
        const enable = jest.fn().mockResolvedValue({ enabled: true })
        const disable = jest.fn().mockResolvedValue({ enabled: false })
        const service = new McpPublicationService(
            publicationRepository,
            repository<McpPublicationCapability>({ count: jest.fn().mockResolvedValue(5) }),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService({
                findConfigured: jest.fn().mockResolvedValue({ enabled: true }),
                enable,
                disable
            })
        )

        await expect(service.getManaged(publication.id)).resolves.toBe(publication)
        await expect(service.disable(publication.id)).resolves.toEqual(expect.objectContaining({ status: 'disabled' }))
        await expect(service.enable(publication.id)).resolves.toEqual(expect.objectContaining({ status: 'active' }))

        expect(disable).toHaveBeenCalledWith(publication, 'organization-1')
        expect(enable).toHaveBeenCalledWith(publication, 'organization-1')
        expect(publicationRepository.save).not.toHaveBeenCalled()
        expect(publication.status).toBe('active')
    })
})

describe('McpPublicationService policy enforcement', () => {
    it('rejects OAuth authentication in the open-source distribution', async () => {
        environment.mcpOAuthEnabled = false
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Generic MCP',
            slug: 'generic-mcp',
            status: 'draft',
            authMethods: ['api_key']
        })
        const service = new McpPublicationService(
            repository<McpPublication>({ findOne: jest.fn().mockResolvedValue(publication) }),
            repository<McpPublicationCapability>(),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.update(publication.id, { authMethods: ['api_key', 'oauth'] })).rejects.toBeInstanceOf(
            ForbiddenException
        )

        publication.authMethods = ['oauth']
        publication.reviewStatus = 'current'
        await expect(service.enable(publication.id)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('keeps the public service slug immutable after creation', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Generic MCP',
            slug: 'generic-mcp',
            status: 'draft',
            authMethods: ['api_key']
        })
        const service = new McpPublicationService(
            repository<McpPublication>({
                findOne: jest.fn().mockResolvedValue(publication),
                save: jest.fn(async (value) => value)
            }),
            repository<McpPublicationCapability>(),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.update(publication.id, { slug: 'renamed-service' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(publication.slug).toBe('generic-mcp')
    })

    it('lets the owning plugin synchronize an automatically managed Publication slug', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            name: 'Generic MCP',
            slug: 'legacy-client-specific-slug'
        })
        const findOne = jest.fn(async ({ where }: { where: { id?: string; slug?: string } }) =>
            where.id === publication.id ? publication : null
        )
        const save = jest.fn(async (value) => value)
        const service = new McpPublicationService(
            repository<McpPublication>({ findOne, save }),
            repository<McpPublicationCapability>(),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.synchronizeManagedSlug(publication.id, 'generic-mcp')).resolves.toBe(publication)

        expect(publication.slug).toBe('generic-mcp')
        expect(save).toHaveBeenCalledWith(publication)
    })

    it('requires an enabled OAuth policy before enabling an OAuth Publication', async () => {
        const publication: McpPublication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            status: 'draft',
            reviewStatus: 'current',
            authMethods: ['oauth']
        })
        const findOAuthPolicy = jest.fn().mockResolvedValue(null)
        const service = new McpPublicationService(
            repository<McpPublication>({
                findOne: jest.fn().mockResolvedValue(publication),
                save: jest.fn(async (value) => value)
            }),
            repository<McpPublicationCapability>({
                count: jest.fn().mockResolvedValue(1),
                find: jest.fn().mockResolvedValue([])
            }),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>({ findOne: findOAuthPolicy }),
            repository<McpInvocationAudit>(),
            { publishCatalogChanged: jest.fn() } as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.enable(publication.id)).rejects.toBeInstanceOf(BadRequestException)

        findOAuthPolicy.mockResolvedValue({ publicationId: publication.id, enabled: true })
        await expect(service.enable(publication.id)).resolves.toBe(publication)
        expect(findOAuthPolicy).toHaveBeenCalledWith({
            where: { publicationId: publication.id, tenantId: publication.tenantId, enabled: true }
        })

        publication.authMethods = ['api_key']
        publication.status = 'active'
        findOAuthPolicy.mockResolvedValue(null)
        await expect(service.update(publication.id, { authMethods: ['api_key', 'oauth'] })).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('rejects bypassing approval for a dangerous tool during replacement', async () => {
        const { service } = policyService()

        await expect(
            service.replaceCapabilities('publication-1', [
                {
                    toolsetId: '10000000-0000-4000-8000-000000000004',
                    capabilityType: 'tool',
                    capabilityKey: 'delete_repository',
                    publicName: 'delete_repository',
                    policy: { approvalMode: 'allow' }
                }
            ])
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects bypassing approval when patching an existing dangerous tool', async () => {
        const { service } = policyService()

        await expect(
            service.patchCapability('publication-1', 'binding-1', {
                policy: { approvalMode: 'allow' }
            })
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a public name already used by another capability when patching', async () => {
        const { service } = policyService({
            conflictingBinding: Object.assign(new McpPublicationCapability(), {
                id: 'binding-2',
                publicationId: 'publication-1',
                publicName: 'existing_name'
            })
        })

        await expect(
            service.patchCapability('publication-1', 'binding-1', {
                publicName: 'existing_name'
            })
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})

describe('McpPublicationService capability reconciliation', () => {
    it('replaces the discovered catalog and auto-managed bindings in one transaction', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null
        })
        const toolsetId = '10000000-0000-4000-8000-000000000004'
        const descriptor = {
            descriptorVersion: 1 as const,
            capabilityType: 'tool' as const,
            capabilityKey: 'factory_cases_search',
            source: { toolsetId },
            requiredContext: ['organization'] as const,
            visibility: ['model'] as const,
            inputSchema: { type: 'object' },
            behavior: { risk: 'read' as const, sideEffect: 'none' as const, idempotency: 'safe' as const }
        }
        const catalogItem = Object.assign(new McpCapabilityCatalog(), {
            id: 'catalog-1',
            tenantId: publication.tenantId,
            organizationId: publication.organizationId,
            toolsetId,
            capabilityType: descriptor.capabilityType,
            capabilityKey: descriptor.capabilityKey,
            descriptorHash: 'descriptor-hash',
            descriptor,
            enabled: true
        })
        const manager = {
            delete: jest.fn().mockResolvedValue(undefined),
            save: jest.fn(async (_entity, values) => values),
            update: jest.fn().mockResolvedValue(undefined)
        }
        const transaction = jest.fn(async (callback) => callback(manager))
        const bindingRepository = repository<McpPublicationCapability>({
            create: jest.fn((value) => Object.assign(new McpPublicationCapability(), value)),
            find: jest.fn().mockResolvedValue([]),
            manager: { transaction }
        })
        const publishCatalogChanged = jest.fn()
        const service = new McpPublicationService(
            repository<McpPublication>({ findOne: jest.fn().mockResolvedValue(publication) }),
            bindingRepository,
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>({ find: jest.fn().mockResolvedValue([{ id: toolsetId }]) }),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            { publishCatalogChanged } as unknown as McpSubscriptionService,
            accessService()
        )

        await service.replaceCapabilitiesWithCatalog(
            publication.id,
            [catalogItem],
            [
                {
                    toolsetId,
                    capabilityType: 'tool',
                    capabilityKey: descriptor.capabilityKey,
                    publicName: descriptor.capabilityKey,
                    enabled: true
                }
            ]
        )

        expect(transaction).toHaveBeenCalledTimes(1)
        expect(manager.delete).toHaveBeenNthCalledWith(1, McpCapabilityCatalog, { toolsetId: In([toolsetId]) })
        expect(manager.save).toHaveBeenNthCalledWith(1, McpCapabilityCatalog, [catalogItem])
        expect(manager.delete).toHaveBeenNthCalledWith(2, McpPublicationCapability, {
            publicationId: publication.id
        })
        expect(manager.save).toHaveBeenNthCalledWith(
            2,
            McpPublicationCapability,
            expect.arrayContaining([
                expect.objectContaining({
                    publicationId: publication.id,
                    toolsetId,
                    capabilityKey: descriptor.capabilityKey
                })
            ])
        )
        expect(manager.update).toHaveBeenCalledWith(
            McpPublication,
            { id: publication.id },
            expect.objectContaining({ reviewStatus: 'current', reviewReason: null })
        )
    })

    it('lists every scoped toolset that has selectable catalog capabilities', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null
        })
        const cutToolsetId = '10000000-0000-4000-8000-000000000004'
        const emptyToolsetId = '10000000-0000-4000-8000-000000000005'
        const capabilityBuilder = rawBuilder([{ toolsetId: cutToolsetId, capabilityCount: '54' }])
        const toolsetRepository = repository<XpertToolset>({
            find: jest.fn().mockResolvedValue([
                Object.assign(new XpertToolset(), {
                    id: cutToolsetId,
                    name: 'Cut MCP Capabilities',
                    options: { pluginManaged: true, pluginName: '@xpert-ai/plugin-cut', componentKey: 'cut' }
                }),
                Object.assign(new XpertToolset(), { id: emptyToolsetId, name: 'Empty toolset' })
            ])
        })
        const service = new McpPublicationService(
            repository<McpPublication>({ findOne: jest.fn().mockResolvedValue(publication) }),
            repository<McpPublicationCapability>(),
            repository<McpCapabilityCatalog>({ createQueryBuilder: jest.fn(() => capabilityBuilder) }),
            toolsetRepository,
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.availableCapabilitySources(publication.id)).resolves.toEqual([
            {
                toolsetId: cutToolsetId,
                name: 'Cut MCP Capabilities',
                pluginName: '@xpert-ai/plugin-cut',
                capabilityCount: 54
            }
        ])
        expect(toolsetRepository.find).toHaveBeenCalledWith({
            select: { id: true, name: true, options: true },
            where: {
                tenantId: publication.tenantId,
                organizationId: IsNull(),
                workspaceId: IsNull()
            }
        })
    })

    it('loads the available catalog for only the expanded toolset group', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null
        })
        const toolsetId = '10000000-0000-4000-8000-000000000004'
        const toolsetRepository = repository<XpertToolset>({
            find: jest.fn().mockResolvedValue([{ id: toolsetId }])
        })
        const catalogRepository = repository<McpCapabilityCatalog>({ find: jest.fn().mockResolvedValue([]) })
        const service = new McpPublicationService(
            repository<McpPublication>({ findOne: jest.fn().mockResolvedValue(publication) }),
            repository<McpPublicationCapability>(),
            catalogRepository,
            toolsetRepository,
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {} as unknown as McpSubscriptionService,
            accessService()
        )

        await expect(service.availableCapabilities(publication.id, toolsetId)).resolves.toEqual([])

        expect(toolsetRepository.find).toHaveBeenCalledWith({
            select: { id: true },
            where: {
                tenantId: publication.tenantId,
                organizationId: IsNull(),
                workspaceId: IsNull(),
                id: toolsetId
            }
        })
        expect(catalogRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ toolsetId: In([toolsetId]) })
            })
        )
    })

    it('marks the current response for review when a source capability disappears', async () => {
        const { service, publication, publicationRepository } = reconciliationService([])

        await expect(service.resolveRuntimeCapabilities(publication)).resolves.toEqual([])

        expect(publication.reviewStatus).toBe('required')
        expect(publication.reviewReason).toContain('source capability is unavailable')
        expect(publicationRepository.update).toHaveBeenCalledWith(
            publication.id,
            expect.objectContaining({ reviewStatus: 'required' })
        )
    })

    it('withholds a stale catalog entry after its source toolset is deleted', async () => {
        const { service, publication, publicationRepository } = reconciliationService([dangerousCatalog()], [])

        await expect(service.resolveRuntimeCapabilities(publication)).resolves.toEqual([])

        expect(publication.reviewStatus).toBe('required')
        expect(publication.reviewReason).toContain('source toolset is unavailable')
        expect(publicationRepository.update).toHaveBeenCalledWith(
            publication.id,
            expect.objectContaining({ reviewStatus: 'required' })
        )
    })

    it('requires review and withholds a tool whose risk increased', async () => {
        const current = dangerousCatalog()
        const { service, publication, publicationRepository } = reconciliationService([current])

        await expect(service.resolveRuntimeCapabilities(publication)).resolves.toEqual([])

        expect(publication.reviewStatus).toBe('required')
        expect(publication.reviewReason).toContain("tool risk increased from 'read' to 'dangerous'")
        expect(publicationRepository.update).toHaveBeenCalledWith(
            publication.id,
            expect.objectContaining({ reviewStatus: 'required' })
        )
    })

    it('looks up runtime publications by active status so disabling invalidates every credential path', async () => {
        const publicationRepository = repository<McpPublication>({ findOne: jest.fn().mockResolvedValue(null) })
        const service = baseService(publicationRepository)

        await expect(service.findActiveBySlug('generic-mcp')).rejects.toBeInstanceOf(NotFoundException)
        expect(publicationRepository.findOne).toHaveBeenCalledWith({
            where: { slug: 'generic-mcp', status: 'active' },
            relations: ['capabilities']
        })
    })

    it('broadcasts access invalidation when a Publication is disabled', async () => {
        const publication = Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: null,
            status: 'active'
        })
        const publishAccessInvalidated = jest.fn()
        const service = new McpPublicationService(
            repository<McpPublication>({
                findOne: jest.fn().mockResolvedValue(publication),
                save: jest.fn(async (value) => value)
            }),
            repository<McpPublicationCapability>({ find: jest.fn().mockResolvedValue([]) }),
            repository<McpCapabilityCatalog>(),
            repository<XpertToolset>(),
            repository<McpApiKey>(),
            repository<McpOAuthPolicy>(),
            repository<McpInvocationAudit>(),
            {
                publishCatalogChanged: jest.fn(),
                publishAccessInvalidated
            } as unknown as McpSubscriptionService,
            accessService()
        )

        await service.disable(publication.id)

        expect(publication.status).toBe('disabled')
        expect(publishAccessInvalidated).toHaveBeenCalledWith(publication.id)
    })
})

function repository<TEntity>(methods: object = {}) {
    return methods as unknown as Repository<TEntity>
}

function policyService(options?: { conflictingBinding?: McpPublicationCapability }) {
    const publication = Object.assign(new McpPublication(), {
        id: 'publication-1',
        tenantId: 'tenant-1',
        organizationId: null
    })
    const descriptor = {
        descriptorVersion: 1 as const,
        capabilityType: 'tool' as const,
        capabilityKey: 'delete_repository',
        source: { toolsetId: '10000000-0000-4000-8000-000000000004' },
        requiredContext: ['workspace'] as const,
        visibility: ['model'] as const,
        inputSchema: { type: 'object' },
        behavior: {
            risk: 'dangerous' as const,
            sideEffect: 'irreversible' as const,
            idempotency: 'non_idempotent' as const
        }
    }
    const catalog = Object.assign(new McpCapabilityCatalog(), {
        id: 'catalog-1',
        tenantId: publication.tenantId,
        organizationId: publication.organizationId,
        toolsetId: descriptor.source.toolsetId,
        capabilityType: descriptor.capabilityType,
        capabilityKey: descriptor.capabilityKey,
        descriptorHash: 'hash',
        descriptor,
        enabled: true
    })
    const binding = Object.assign(new McpPublicationCapability(), {
        id: 'binding-1',
        publicationId: publication.id,
        tenantId: publication.tenantId,
        organizationId: publication.organizationId,
        toolsetId: descriptor.source.toolsetId,
        capabilityType: descriptor.capabilityType,
        capabilityKey: descriptor.capabilityKey,
        publicName: descriptor.capabilityKey,
        descriptorHash: catalog.descriptorHash,
        descriptorSnapshot: descriptor,
        enabled: true
    })
    const service = new McpPublicationService(
        repository<McpPublication>({ findOne: jest.fn().mockResolvedValue(publication) }),
        repository<McpPublicationCapability>({
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(async ({ where }: { where: { id?: string; publicName?: string } }) => {
                if (where.id === binding.id) return binding
                if (where.publicName === options?.conflictingBinding?.publicName) return options.conflictingBinding
                return null
            })
        }),
        repository<McpCapabilityCatalog>({ find: jest.fn().mockResolvedValue([catalog]) }),
        repository<XpertToolset>({
            find: jest.fn().mockResolvedValue([
                Object.assign(new XpertToolset(), {
                    id: descriptor.source.toolsetId,
                    tenantId: publication.tenantId,
                    organizationId: publication.organizationId,
                    workspaceId: null
                })
            ])
        }),
        repository<McpApiKey>(),
        repository<McpOAuthPolicy>(),
        repository<McpInvocationAudit>(),
        { publishCatalogChanged: jest.fn() } as unknown as McpSubscriptionService,
        accessService()
    )
    return { service }
}

function reconciliationService(
    catalog: McpCapabilityCatalog[],
    toolsets: XpertToolset[] = [
        Object.assign(new XpertToolset(), {
            id: '10000000-0000-4000-8000-000000000004',
            workspaceId: null
        })
    ]
) {
    const descriptor = {
        descriptorVersion: 1 as const,
        capabilityType: 'tool' as const,
        capabilityKey: 'generic_search',
        source: { toolsetId: '10000000-0000-4000-8000-000000000004' },
        requiredContext: ['workspace'] as const,
        visibility: ['model'] as const,
        inputSchema: { type: 'object' },
        behavior: { risk: 'read' as const, sideEffect: 'none' as const, idempotency: 'safe' as const }
    }
    const binding = Object.assign(new McpPublicationCapability(), {
        id: 'binding-1',
        publicationId: 'publication-1',
        tenantId: 'tenant-1',
        organizationId: null,
        toolsetId: descriptor.source.toolsetId,
        capabilityType: descriptor.capabilityType,
        capabilityKey: descriptor.capabilityKey,
        publicName: descriptor.capabilityKey,
        descriptorHash: 'old-hash',
        descriptorSnapshot: descriptor,
        policy: { approvalMode: 'allow' as const },
        enabled: true
    })
    const publication = Object.assign(new McpPublication(), {
        id: 'publication-1',
        tenantId: binding.tenantId,
        organizationId: null,
        status: 'active' as const,
        reviewStatus: 'current' as const,
        reviewReason: null,
        capabilities: [binding]
    })
    const publicationRepository = repository<McpPublication>({ update: jest.fn().mockResolvedValue(undefined) })
    const service = new McpPublicationService(
        publicationRepository,
        repository<McpPublicationCapability>({ save: jest.fn() }),
        repository<McpCapabilityCatalog>({ find: jest.fn().mockResolvedValue(catalog) }),
        repository<XpertToolset>({ find: jest.fn().mockResolvedValue(toolsets) }),
        repository<McpApiKey>(),
        repository<McpOAuthPolicy>(),
        repository<McpInvocationAudit>(),
        { publishCatalogChanged: jest.fn() } as unknown as McpSubscriptionService,
        accessService()
    )
    return { service, publication, publicationRepository }
}

function dangerousCatalog() {
    return Object.assign(new McpCapabilityCatalog(), {
        id: 'catalog-1',
        tenantId: 'tenant-1',
        organizationId: null,
        toolsetId: '10000000-0000-4000-8000-000000000004',
        capabilityType: 'tool' as const,
        capabilityKey: 'generic_search',
        descriptorHash: 'new-hash',
        descriptor: {
            descriptorVersion: 1 as const,
            capabilityType: 'tool' as const,
            capabilityKey: 'generic_search',
            source: { toolsetId: '10000000-0000-4000-8000-000000000004' },
            requiredContext: ['workspace'],
            visibility: ['model'],
            inputSchema: { type: 'object' },
            behavior: {
                risk: 'dangerous' as const,
                sideEffect: 'irreversible' as const,
                idempotency: 'non_idempotent' as const
            }
        },
        enabled: true
    })
}

function baseService(publicationRepository: Repository<McpPublication>) {
    return new McpPublicationService(
        publicationRepository,
        repository<McpPublicationCapability>(),
        repository<McpCapabilityCatalog>(),
        repository<XpertToolset>(),
        repository<McpApiKey>(),
        repository<McpOAuthPolicy>(),
        repository<McpInvocationAudit>(),
        {} as McpSubscriptionService,
        accessService()
    )
}

function rawBuilder<T>(rows: T[]) {
    const builder = {
        select: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        groupBy: jest.fn(),
        getRawMany: jest.fn().mockResolvedValue(rows)
    }
    builder.select.mockReturnValue(builder)
    builder.addSelect.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.andWhere.mockReturnValue(builder)
    builder.groupBy.mockReturnValue(builder)
    return builder
}

function accessService(methods: Partial<McpPublicationAccessService> = {}) {
    return methods as McpPublicationAccessService
}
