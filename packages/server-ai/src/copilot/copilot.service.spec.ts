import { AiProviderRole } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotProvider } from '../copilot-provider/copilot-provider.entity'
import { CopilotProviderService } from '../copilot-provider/copilot-provider.service'
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
    let configService: jest.Mocked<Pick<ConfigService, 'get'>>
    let service: CopilotService

    beforeEach(async () => {
        repository = {
            find: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }
        copilotProviderService = {
            findVisibleByCopilotIds: jest.fn()
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
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true
            },
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

    it('falls back to tenant-global copilots before hydrating visible providers', async () => {
        repository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([
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

        expect(repository.find).toHaveBeenNthCalledWith(1, {
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                enabled: true
            },
            relations: ['modelProvider']
        })
        expect(repository.find).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                relations: ['modelProvider']
            })
        )

        const secondCall = repository.find.mock.calls[1][0]
        expect(Array.isArray(secondCall.where)).toBe(false)
        if (Array.isArray(secondCall.where)) {
            throw new Error('Expected tenant fallback query to use a single where object')
        }

        expect(secondCall.where).toMatchObject({
            tenantId: 'tenant-1',
            enabled: true
        })
        expect(secondCall.where.organizationId).toBeDefined()
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('copilot-2')
        expect(result[0].modelProvider?.id).toBe('tenant-provider')
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
