import { OrderTypeEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { CopilotUser } from './copilot-user.entity'
import { CopilotUserService } from './copilot-user.service'

jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')

    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(),
            getOrganizationId: jest.fn()
        }
    }
})

type CopilotUserRepositoryMock = {
    createQueryBuilder: jest.Mock
    find: jest.Mock
    save: jest.Mock
}

function mockRequestContext() {
    const currentTenantId = RequestContext.currentTenantId as jest.MockedFunction<typeof RequestContext.currentTenantId>
    const getOrganizationId = RequestContext.getOrganizationId as jest.MockedFunction<
        typeof RequestContext.getOrganizationId
    >

    currentTenantId.mockReturnValue('tenant-1')
    getOrganizationId.mockReturnValue('org-1')
}

function createQueryBuilderMock(rawRows: Array<Record<string, unknown>>) {
    const queryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rawRows)
    }

    return queryBuilder as unknown as SelectQueryBuilder<CopilotUser>
}

function createService(repository: CopilotUserRepositoryMock) {
    return new CopilotUserService(repository as unknown as Repository<CopilotUser>)
}

describe('CopilotUserService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRequestContext()
    })

    it('groups user model usage into one quota row without preloading session details', async () => {
        const rawRows = [
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'user-1',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                currency: 'CNY',
                tokenUsed: '77',
                priceUsed: '0.125',
                tokenTotalUsed: '10',
                priceTotalUsed: '0.02',
                tokenLimit: '1000',
                priceLimit: '2.5',
                updatedAt: new Date('2026-05-29T01:30:00.000Z'),
                userRelationId: 'user-1',
                userFirstName: 'Yu',
                userLastName: 'Rongku',
                userEmail: 'yurongku@gmail.com',
                userUsername: 'yu rongku',
                userImageUrl: 'avatar.png',
                orgRelationId: 'provider-org-1',
                orgName: 'provider org',
                orgImageUrl: 'org.png',
                total: '1'
            }
        ]
        const repository: CopilotUserRepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock(rawRows)),
            find: jest.fn(),
            save: jest.fn()
        }
        const service = createService(repository)

        const result = await service.findUserUsageSummaries({
            order: { updatedAt: OrderTypeEnum.DESC },
            take: 20,
            skip: 0
        })

        expect(result.total).toBe(1)
        expect(result.items).toHaveLength(1)
        expect(result.items[0]).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            orgId: 'provider-org-1',
            userId: 'user-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            currency: 'CNY',
            tokenUsed: 77,
            priceUsed: 0.125,
            tokenTotalUsed: 10,
            priceTotalUsed: 0.02,
            tokenLimit: 1000,
            priceLimit: 2.5,
            user: {
                id: 'user-1',
                firstName: 'Yu',
                lastName: 'Rongku',
                email: 'yurongku@gmail.com',
                username: 'yu rongku',
                imageUrl: 'avatar.png'
            },
            org: {
                id: 'provider-org-1',
                name: 'provider org',
                imageUrl: 'org.png'
            }
        })
        expect(result.items[0].details).toBeUndefined()
        expect(repository.find).not.toHaveBeenCalled()
    })

    it('loads user model usage details with request scoped tenant and organization', async () => {
        const details = [
            {
                id: 'usage-thread-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'user-1',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                currency: 'CNY',
                threadId: 'thread-1',
                usageHour: '2026-05-29 01',
                tokenUsed: 47
            },
            {
                id: 'usage-thread-2',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'user-1',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                currency: 'CNY',
                threadId: 'thread-2',
                usageHour: '2026-05-29 01',
                tokenUsed: 30
            }
        ] as CopilotUser[]
        const repository: CopilotUserRepositoryMock = {
            createQueryBuilder: jest.fn(),
            find: jest.fn().mockResolvedValue(details),
            save: jest.fn()
        }
        const service = createService(repository)

        const result = await service.findUserUsageDetails({
            tenantId: 'tenant-evil',
            organizationId: 'org-evil',
            orgId: 'provider-org-1',
            userId: 'user-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            currency: 'CNY'
        })

        const findOptions = repository.find.mock.calls[0]?.[0]
        expect(result).toBe(details)
        expect(findOptions?.where).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            orgId: 'provider-org-1',
            userId: 'user-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            currency: 'CNY'
        })
        expect(findOptions?.where).not.toHaveProperty('threadId')
        expect(findOptions?.where).not.toHaveProperty('usageHour')
    })

    it('rejects usage details and renew requests without required group identity fields', async () => {
        const repository: CopilotUserRepositoryMock = {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
            save: jest.fn()
        }
        const service = createService(repository)

        await expect(service.findUserUsageDetails({ provider: 'tongyi' })).rejects.toThrow(
            'Missing required copilot user usage group fields'
        )
        await expect(
            service.renewUserUsageSummary({
                userId: 'user-1',
                tokenLimit: 1000
            })
        ).rejects.toThrow('Missing required copilot user usage group fields')
        expect(repository.find).not.toHaveBeenCalled()
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('renews a user model quota group without deleting per-session history or clearing price limits', async () => {
        const details = [
            {
                id: 'usage-thread-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'user-1',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                currency: 'CNY',
                threadId: 'thread-1',
                tokenUsed: 47,
                tokenTotalUsed: 3,
                priceUsed: 0.12,
                priceTotalUsed: 0.01,
                priceLimit: 1.5
            },
            {
                id: 'usage-thread-2',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'user-1',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                currency: 'CNY',
                threadId: 'thread-2',
                tokenUsed: 30,
                tokenTotalUsed: 0,
                priceUsed: 0.005,
                priceTotalUsed: 0,
                priceLimit: 1.2
            }
        ] as CopilotUser[]
        const repository: CopilotUserRepositoryMock = {
            createQueryBuilder: jest.fn(),
            find: jest.fn().mockResolvedValue(details),
            save: jest.fn(async (records: CopilotUser[]) => records)
        }
        const service = createService(repository)

        const result = await service.renewUserUsageSummary({
            tenantId: 'tenant-evil',
            organizationId: 'org-evil',
            orgId: 'provider-org-1',
            userId: 'user-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            currency: 'CNY',
            tokenLimit: 1000
        })

        const findOptions = repository.find.mock.calls[0]?.[0]
        expect(findOptions?.where).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            orgId: 'provider-org-1',
            userId: 'user-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            currency: 'CNY'
        })
        expect(repository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'usage-thread-1',
                tokenUsed: 0,
                tokenTotalUsed: 50,
                priceUsed: 0,
                priceTotalUsed: 0.13,
                tokenLimit: 1000,
                priceLimit: 1.5
            }),
            expect.objectContaining({
                id: 'usage-thread-2',
                tokenUsed: 0,
                tokenTotalUsed: 30,
                priceUsed: 0,
                priceTotalUsed: 0.005,
                tokenLimit: 1000,
                priceLimit: 1.2
            })
        ])
        expect(result).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            tokenUsed: 0,
            priceUsed: 0,
            tokenTotalUsed: 80,
            priceTotalUsed: 0.135,
            tokenLimit: 1000,
            priceLimit: 1.5
        })
        expect(result.details).toHaveLength(2)
    })
})
