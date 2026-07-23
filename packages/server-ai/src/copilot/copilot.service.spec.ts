import { AiProviderRole } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotProvider } from '../copilot-provider/copilot-provider.entity'
import { CopilotProviderService } from '../copilot-provider/copilot-provider.service'
import { MembershipService } from '../membership'
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
    let repository: jest.Mocked<Pick<Repository<Copilot>, 'find'>>
    let queryBus: jest.Mocked<Pick<QueryBus, 'execute'>>
    let copilotProviderService: jest.Mocked<Pick<CopilotProviderService, 'findVisibleByCopilotIds'>>
    let membershipService: jest.Mocked<
        Pick<
            MembershipService,
            | 'findModelAccess'
            | 'countEnabledOrganizationCopilots'
            | 'ensureScopeInitialized'
            | 'isMembershipAccessEnabled'
        >
    >
    let configService: jest.Mocked<Pick<ConfigService, 'get'>>
    let service: CopilotService

    beforeEach(async () => {
        repository = {
            find: jest.fn().mockResolvedValue([])
        }
        queryBus = {
            execute: jest.fn()
        }
        copilotProviderService = {
            findVisibleByCopilotIds: jest.fn().mockResolvedValue(new Map())
        }
        membershipService = {
            countEnabledOrganizationCopilots: jest.fn().mockResolvedValue(0),
            ensureScopeInitialized: jest.fn().mockResolvedValue({} as never),
            isMembershipAccessEnabled: jest.fn().mockResolvedValue(true),
            findModelAccess: jest.fn().mockResolvedValue({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membership: {}
            })
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
                    provide: ConfigService,
                    useValue: configService
                }
            ]
        }).compile()

        service = moduleRef.get(CopilotService)
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
                },
                expect.objectContaining({
                    tenantId: 'tenant-1',
                    enabled: true
                })
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

        expect(firstCall.where[0]).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            enabled: true
        })
        expect(firstCall.where[1]).toMatchObject({
            tenantId: 'tenant-1',
            enabled: true
        })
        expect(firstCall.where[1].organizationId).toBeDefined()
        expect(copilotProviderService.findVisibleByCopilotIds).toHaveBeenCalledWith(['copilot-2'], {
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('copilot-2')
        expect(result[0].modelProvider?.id).toBe('tenant-provider')
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
        expect(repository.find).toHaveBeenCalledTimes(1)
        expect(copilotProviderService.findVisibleByCopilotIds).not.toHaveBeenCalled()
    })

    it('keeps copilots outside the membership access scope unavailable even with configured credentials', async () => {
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
    })

    it('returns no organization copilots with configured credentials when membership access is missing', async () => {
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

        expect(result).toEqual([])
    })

    it('returns no organization copilots without configured credentials when membership access is missing', async () => {
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
    })

    it('lists organization and tenant enabled copilots without membership access when membership plans are disabled', async () => {
        membershipService.isMembershipAccessEnabled.mockResolvedValue(false)
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

        expect(membershipService.countEnabledOrganizationCopilots).not.toHaveBeenCalled()
        expect(membershipService.ensureScopeInitialized).not.toHaveBeenCalled()
        expect(membershipService.findModelAccess).not.toHaveBeenCalled()
        expect(repository.find).toHaveBeenCalledTimes(1)
        const where = repository.find.mock.calls[0][0].where
        expect(Array.isArray(where)).toBe(true)
        if (!Array.isArray(where)) {
            throw new Error('Expected organization-scope copilot query to use inherited where objects')
        }
        expect(where[0]).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            enabled: true,
            role: AiProviderRole.Primary
        })
        expect(where[1]).toMatchObject({
            tenantId: 'tenant-1',
            enabled: true,
            role: AiProviderRole.Primary
        })
        expect(where[1].organizationId).toBeDefined()
        expect(copilotProviderService.findVisibleByCopilotIds).toHaveBeenCalledWith(['org-copilot', 'tenant-copilot'], {
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(result).toHaveLength(2)
    })

    it('lists only tenant enabled copilots without membership access in tenant scope when membership plans are disabled', async () => {
        membershipService.isMembershipAccessEnabled.mockResolvedValue(false)
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

        expect(membershipService.countEnabledOrganizationCopilots).not.toHaveBeenCalled()
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

    it('initializes organization membership before listing local copilots', async () => {
        membershipService.countEnabledOrganizationCopilots.mockResolvedValue(1)
        repository.find.mockResolvedValue([])
        copilotProviderService.findVisibleByCopilotIds.mockResolvedValue(new Map())

        await service.findAllAvailablesCopilots('tenant-1', 'org-1')

        expect(membershipService.ensureScopeInitialized).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: null
        })
        expect(membershipService.findModelAccess).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1'
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
