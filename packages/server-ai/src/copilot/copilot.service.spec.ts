import { AiProviderRole, AIPermissionsEnum } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/server-core'
import { QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CopilotProvider } from '../copilot-provider/copilot-provider.entity'
import { CopilotProviderService } from '../copilot-provider/copilot-provider.service'
import { MembershipService } from '../membership'
import { ModelAccessService } from '../model-access'
import { Copilot } from './copilot.entity'
import { CopilotService } from './copilot.service'

jest.mock('../ai-model', () => ({
    AiProviderDto: class AiProviderDto {},
    ListModelProvidersQuery: class ListModelProvidersQuery {
        constructor(readonly providerNames?: string[]) {}
    }
}))

describe('CopilotService', () => {
    let moduleRef: TestingModule
    let repository: {
        create: jest.Mock
        find: jest.Mock
        findOneByOrFail: jest.Mock
        save: jest.Mock
    }
    let queryBus: jest.Mocked<Pick<QueryBus, 'execute'>>
    let copilotProviderService: jest.Mocked<Pick<CopilotProviderService, 'findVisibleByCopilotIds'>>
    let membershipService: jest.Mocked<
        Pick<MembershipService, 'findModelAccess' | 'ensureScopeInitialized' | 'isMembershipPlanEnabled'>
    >
    let modelAccessService: jest.Mocked<
        Pick<ModelAccessService, 'handleCopilotStateChanged' | 'hasConfiguredOrganizationModels'>
    >
    let configService: jest.Mocked<Pick<ConfigService, 'get'>>
    let service: CopilotService

    beforeEach(async () => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        repository = {
            create: jest.fn((entity) => createCopilot(entity)),
            find: jest.fn().mockResolvedValue([]),
            findOneByOrFail: jest.fn().mockRejectedValue(new Error('not found')),
            save: jest.fn(async (entity) => entity as Copilot)
        }
        queryBus = {
            execute: jest.fn()
        }
        copilotProviderService = {
            findVisibleByCopilotIds: jest.fn().mockResolvedValue(new Map())
        }
        membershipService = {
            ensureScopeInitialized: jest.fn().mockResolvedValue({} as never),
            isMembershipPlanEnabled: jest.fn().mockResolvedValue(true),
            findModelAccess: jest.fn().mockResolvedValue({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membership: { plan: {} }
            })
        }
        modelAccessService = {
            handleCopilotStateChanged: jest.fn().mockResolvedValue(undefined),
            hasConfiguredOrganizationModels: jest.fn().mockResolvedValue(false)
        }
        configService = {
            get: jest.fn().mockReturnValue('http://localhost')
        }

        moduleRef = await Test.createTestingModule({
            providers: [
                CopilotService,
                {
                    provide: getRepositoryToken(Copilot),
                    useValue: repository
                },
                {
                    provide: QueryBus,
                    useValue: queryBus
                },
                {
                    provide: CopilotProviderService,
                    useValue: copilotProviderService
                },
                {
                    provide: MembershipService,
                    useValue: membershipService
                },
                {
                    provide: ModelAccessService,
                    useValue: modelAccessService
                },
                {
                    provide: ConfigService,
                    useValue: configService
                }
            ]
        }).compile()

        service = moduleRef.get(CopilotService)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    afterEach(async () => {
        await moduleRef?.close()
    })

    it('replaces eager-loaded providers with scope-visible providers', async () => {
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'copilot-1',
                organizationId: 'org-1',
                role: AiProviderRole.Primary,
                modelProvider: createProvider({
                    id: 'stale-provider',
                    providerName: 'openai'
                })
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'copilot-1',
                    createProvider({
                        id: 'visible-provider',
                        copilotId: 'copilot-1',
                        providerName: 'openai'
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(repository.find).toHaveBeenCalledWith({
            where: [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    enabled: true
                }
            ],
            relations: ['modelProvider']
        })
        expect(copilotProviderService.findVisibleByCopilotIds).toHaveBeenCalledWith(['copilot-1'], {
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(result[0].modelProvider).toMatchObject({
            id: 'visible-provider',
            copilotId: 'copilot-1',
            providerName: 'openai'
        })
    })

    it('uses tenant-global copilots when membership access resolves to tenant scope', async () => {
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: {}
        } as never)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'copilot-2',
                role: AiProviderRole.Secondary,
                modelProvider: createProvider({
                    id: 'tenant-provider',
                    providerName: 'anthropic'
                })
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'copilot-2',
                    createProvider({
                        id: 'tenant-provider',
                        copilotId: 'copilot-2',
                        providerName: 'anthropic'
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(repository.find).toHaveBeenCalledTimes(1)
        const firstCall = repository.find.mock.calls[0][0]
        expect(Array.isArray(firstCall.where)).toBe(true)
        if (!Array.isArray(firstCall.where)) {
            throw new Error('Expected organization and tenant candidate scopes')
        }

        expect(firstCall.where).toHaveLength(1)
        expect(firstCall.where[0]).toMatchObject({
            tenantId: 'tenant-1',
            enabled: true
        })
        expect(firstCall.where[0].organizationId).toBeDefined()
        expect(copilotProviderService.findVisibleByCopilotIds).toHaveBeenCalledWith(['copilot-2'], {
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('copilot-2')
        expect(result[0].modelProvider?.id).toBe('tenant-provider')
    })

    it('keeps an organization membership purchased from the tenant catalog in organization model scope', async () => {
        modelAccessService.hasConfiguredOrganizationModels.mockResolvedValue(true)
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: {
                plan: {
                    catalogSourcePlanId: 'tenant-catalog-plan'
                }
            }
        } as never)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'organization-copilot',
                organizationId: 'org-1',
                role: AiProviderRole.Primary,
                modelProvider: createProvider({
                    id: 'organization-provider',
                    organizationId: 'org-1',
                    providerName: 'openai'
                })
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'organization-copilot',
                    createProvider({
                        id: 'organization-provider',
                        copilotId: 'organization-copilot',
                        organizationId: 'org-1',
                        providerName: 'openai'
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(repository.find).toHaveBeenCalledWith({
            where: [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    enabled: true
                }
            ],
            relations: ['modelProvider']
        })
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('organization-copilot')
    })

    it('uses tenant catalog copilots for an organization catalog membership without organization models', async () => {
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: {
                plan: {
                    catalogSourcePlanId: 'tenant-catalog-plan'
                }
            }
        } as never)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'tenant-copilot',
                organizationId: null,
                role: AiProviderRole.Primary,
                modelProvider: createProvider({
                    id: 'tenant-provider',
                    organizationId: null,
                    providerName: 'deepseek'
                })
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'tenant-copilot',
                    createProvider({
                        id: 'tenant-provider',
                        copilotId: 'tenant-copilot',
                        organizationId: null,
                        providerName: 'deepseek'
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(membershipService.findModelAccess).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(repository.find).toHaveBeenCalledWith({
            where: [
                expect.objectContaining({
                    tenantId: 'tenant-1',
                    enabled: true
                })
            ],
            relations: ['modelProvider']
        })
        expect(result.map((copilot) => copilot.id)).toEqual(['tenant-copilot'])
    })

    it('uses only tenant-global copilots when no organization scope is provided', async () => {
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: {}
        } as never)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'tenant-copilot',
                role: AiProviderRole.Primary,
                modelProvider: createProvider({
                    id: 'tenant-provider',
                    providerName: 'openai'
                })
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'tenant-copilot',
                    createProvider({
                        id: 'tenant-provider',
                        copilotId: 'tenant-copilot',
                        providerName: 'openai'
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', null, {
            role: AiProviderRole.Primary
        })

        expect(repository.find).toHaveBeenCalledTimes(1)
        expect(repository.find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                enabled: true,
                role: AiProviderRole.Primary
            }),
            relations: ['modelProvider']
        })
        const where = repository.find.mock.calls[0][0].where
        if (Array.isArray(where)) {
            throw new Error('Expected tenant-scope copilot query to use a single where object')
        }
        expect(where.organizationId).toBeDefined()
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('tenant-copilot')
    })

    it('returns no copilots when membership access is missing', async () => {
        membershipService.findModelAccess.mockResolvedValue(null)

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(result).toEqual([])
        expect(repository.find).not.toHaveBeenCalled()
        expect(copilotProviderService.findVisibleByCopilotIds).not.toHaveBeenCalled()
    })

    it('keeps copilots outside the membership access scope unavailable to membership managers', async () => {
        const permissionSpy = jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        membershipService.findModelAccess.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: {}
        } as never)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'tenant-copilot',
                organizationId: null
            }),
            createCopilot({
                id: 'organization-copilot',
                organizationId: 'org-1'
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'tenant-copilot',
                    createProvider({
                        id: 'tenant-provider',
                        copilotId: 'tenant-copilot',
                        organizationId: null
                    })
                ],
                [
                    'organization-copilot',
                    createProvider({
                        id: 'organization-provider',
                        copilotId: 'organization-copilot',
                        organizationId: 'org-1',
                        credentials: { api_key: 'configured' }
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(result.map((copilot) => copilot.id)).toEqual(['tenant-copilot'])
        permissionSpy.mockRestore()
    })

    it('returns organization copilots with configured credentials directly when membership edit permission is missing', async () => {
        const permissionSpy = jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        membershipService.findModelAccess.mockResolvedValue(null)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'organization-copilot',
                organizationId: 'org-1'
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'organization-copilot',
                    createProvider({
                        id: 'organization-provider',
                        copilotId: 'organization-copilot',
                        organizationId: 'org-1',
                        credentials: { api_key: 'configured' }
                    })
                ]
            ])
        )

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(result.map((copilot) => copilot.id)).toEqual(['organization-copilot'])
        permissionSpy.mockRestore()
    })

    it('returns no organization copilots without configured credentials when membership access is missing', async () => {
        const permissionSpy = jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
        membershipService.findModelAccess.mockResolvedValue(null)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'organization-copilot',
                organizationId: 'org-1'
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(
            new Map([
                [
                    'organization-copilot',
                    createProvider({
                        id: 'organization-provider',
                        copilotId: 'organization-copilot',
                        organizationId: 'org-1',
                        credentials: {}
                    })
                ]
            ])
        )

        await expect(service.findAllAvailablesCopilots('tenant-1', 'org-1')).resolves.toEqual([])
        permissionSpy.mockRestore()
    })

    it('lists only direct organization copilots when organization and tenant membership are disabled', async () => {
        membershipService.isMembershipPlanEnabled.mockResolvedValue(false)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'org-copilot',
                organizationId: 'org-1'
            }),
            createCopilot({
                id: 'tenant-copilot',
                organizationId: null
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(new Map())

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1', {
            role: AiProviderRole.Primary
        })

        expect(modelAccessService.hasConfiguredOrganizationModels).toHaveBeenCalledWith('tenant-1', 'org-1')
        expect(membershipService.ensureScopeInitialized).not.toHaveBeenCalled()
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
        expect(repository.find).toHaveBeenCalledTimes(1)
        const where = repository.find.mock.calls[0][0].where
        expect(Array.isArray(where)).toBe(true)
        if (!Array.isArray(where)) {
            throw new Error('Expected organization-scope copilot query to use inherited where objects')
        }
        expect(where).toHaveLength(1)
        expect(where[0]).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            enabled: true,
            role: AiProviderRole.Primary
        })
        expect(copilotProviderService.findVisibleByCopilotIds).toHaveBeenCalledWith(['org-copilot'], {
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(result.map((copilot) => copilot.id)).toEqual(['org-copilot'])
    })

    it('lists only direct organization copilots when organization membership is disabled', async () => {
        membershipService.isMembershipPlanEnabled.mockImplementation(async ({ organizationId }) => !organizationId)
        modelAccessService.hasConfiguredOrganizationModels.mockResolvedValue(true)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'org-copilot',
                organizationId: 'org-1'
            }),
            createCopilot({
                id: 'tenant-copilot',
                organizationId: null
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(new Map())

        const result = await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
        expect(result.map((copilot) => copilot.id)).toEqual(['org-copilot'])
    })

    it('lists only tenant enabled copilots without membership access in tenant scope when membership plans are disabled', async () => {
        membershipService.isMembershipPlanEnabled.mockResolvedValue(false)
        repository.find.mockResolvedValue([
            createCopilot({
                id: 'tenant-copilot',
                organizationId: null
            })
        ])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(new Map())

        const result = await service.findAllAvailablesCopilots('tenant-1', null, {
            role: AiProviderRole.Secondary
        })

        expect(modelAccessService.hasConfiguredOrganizationModels).not.toHaveBeenCalled()
        expect(membershipService.ensureScopeInitialized).not.toHaveBeenCalled()
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
        expect(repository.find).toHaveBeenCalledTimes(1)
        const where = repository.find.mock.calls[0][0].where
        expect(Array.isArray(where)).toBe(false)
        if (Array.isArray(where)) {
            throw new Error('Expected tenant-scope copilot query to use a single where object')
        }
        expect(where).toMatchObject({
            tenantId: 'tenant-1',
            enabled: true,
            role: AiProviderRole.Secondary
        })
        expect(where.organizationId).toBeDefined()
        expect(copilotProviderService.findVisibleByCopilotIds).toHaveBeenCalledWith(['tenant-copilot'], {
            tenantId: 'tenant-1',
            organizationId: null
        })
        expect(result).toHaveLength(1)
    })

    describe('organization membership initialization', () => {
        beforeEach(() => {
            jest.spyOn(RequestContext, 'isOrganizationScope').mockReturnValue(true)
            jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
            jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
            jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
            repository.find.mockResolvedValue([])
            copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(new Map())
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('allows a Trial user to enable organization Primary without membership edit permission', async () => {
            await expect(service.enableRole(AiProviderRole.Primary)).resolves.toMatchObject({
                role: AiProviderRole.Primary,
                enabled: true
            })

            expect(repository.save).toHaveBeenCalled()
            expect(membershipService.ensureScopeInitialized).not.toHaveBeenCalled()
        })

        it('does not initialize organization membership while listing available copilots', async () => {
            jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)

            await service.findAllAvailablesCopilots('tenant-1', 'org-1')

            expect(membershipService.ensureScopeInitialized).not.toHaveBeenCalled()
            expect(membershipService.findModelAccess).toHaveBeenCalledWith({
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        })

        it('initializes organization membership when an authorized manager enables Primary', async () => {
            jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)

            await service.enableRole(AiProviderRole.Primary)

            expect(RequestContext.hasPermission).toHaveBeenCalledWith(AIPermissionsEnum.MEMBERSHIP_EDIT, false)
            expect(membershipService.isMembershipPlanEnabled).toHaveBeenCalledWith({
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
            expect(membershipService.ensureScopeInitialized).toHaveBeenCalledWith({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                assignedById: 'user-1'
            })
        })

        it('does not initialize organization membership when the feature is disabled', async () => {
            jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
            membershipService.isMembershipPlanEnabled.mockResolvedValue(false)

            await service.enableRole(AiProviderRole.Primary)

            expect(membershipService.ensureScopeInitialized).not.toHaveBeenCalled()
        })
    })
})

function createCopilot(overrides: Partial<Copilot>): Copilot {
    return Object.assign(new Copilot(), {
        id: 'copilot-id',
        tenantId: 'tenant-1',
        organizationId: null,
        enabled: true,
        role: AiProviderRole.Primary,
        ...overrides
    })
}

function createProvider(overrides: Partial<CopilotProvider>): CopilotProvider {
    return Object.assign(new CopilotProvider(), {
        id: 'provider-id',
        copilotId: 'copilot-id',
        providerName: 'openai',
        ...overrides
    })
}
