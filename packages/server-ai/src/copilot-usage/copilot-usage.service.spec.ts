import { OrderTypeEnum, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { CopilotOrganization } from '../copilot-organization/copilot-organization.entity'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { CopilotUsageService } from './copilot-usage.service'

jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        RequestContext: {
            currentTenantId: jest.fn(),
            getOrganizationId: jest.fn(),
            hasRole: jest.fn()
        }
    }
})

type RepositoryMock = {
    createQueryBuilder: jest.Mock
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
}

function mockRequestContext(options?: { organizationId?: string | null; superAdmin?: boolean }) {
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(options?.organizationId ?? 'org-1')
    ;(RequestContext.hasRole as jest.Mock).mockImplementation(
        (role) => role === RolesEnum.SUPER_ADMIN && (options?.superAdmin ?? false)
    )
}

function createQueryBuilderMock<T>(rawRows: Array<Record<string, unknown>> = []) {
    const queryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rawRows),
        getMany: jest.fn().mockResolvedValue(rawRows)
    }

    return queryBuilder as unknown as SelectQueryBuilder<T>
}

function createService(userRepository: RepositoryMock, orgRepository: RepositoryMock) {
    return new CopilotUsageService(
        userRepository as unknown as Repository<CopilotUser>,
        orgRepository as unknown as Repository<CopilotOrganization>
    )
}

describe('CopilotUsageService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRequestContext()
    })

    it('summarizes user usage with current and grand totals', async () => {
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(
                createQueryBuilderMock<CopilotUser>([
                    {
                        tenantId: 'tenant-1',
                        organizationId: 'org-1',
                        orgId: 'provider-org-1',
                        userId: 'user-1',
                        provider: 'openai',
                        model: 'gpt-4.1',
                        currency: 'USD',
                        tokenUsed: '40',
                        tokenTotalUsed: '60',
                        priceUsed: '0.4',
                        priceTotalUsed: '0.6',
                        tokenLimit: '1000',
                        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                        userRelationId: 'user-1',
                        userEmail: 'user@example.com',
                        organizationRelationId: 'org-1',
                        organizationName: 'Org 1',
                        total: '1'
                    }
                ])
            ),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const orgRepository: RepositoryMock = {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const service = createService(userRepository, orgRepository)

        const result = await service.findSummaries(
            { dimension: 'user' },
            { order: { updatedAt: OrderTypeEnum.DESC }, take: 20, skip: 0 }
        )

        expect(result.total).toBe(1)
        expect(result.items[0]).toMatchObject({
            dimension: 'user',
            organizationId: 'org-1',
            userId: 'user-1',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD',
            tokenUsed: 40,
            tokenTotalUsed: 60,
            tokenGrandTotal: 100,
            priceUsed: 0.4,
            priceTotalUsed: 0.6,
            priceGrandTotal: 1,
            tokenLimit: 1000
        })
    })

    it('overlays organization quotas from copilot organization rows', async () => {
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(
                createQueryBuilderMock<CopilotUser>([
                    {
                        tenantId: 'tenant-1',
                        organizationId: 'org-1',
                        provider: 'openai',
                        model: 'gpt-4.1',
                        currency: 'USD',
                        tokenUsed: '40',
                        tokenTotalUsed: '60',
                        priceUsed: '0.4',
                        priceTotalUsed: '0.6',
                        organizationRelationId: 'org-1',
                        organizationName: 'Org 1',
                        userCount: '3',
                        total: '1'
                    }
                ])
            ),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const orgRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(
                createQueryBuilderMock<CopilotOrganization>([
                    {
                        organizationId: 'org-1',
                        provider: 'openai',
                        model: 'gpt-4.1',
                        currency: 'USD',
                        tokenLimit: '5000',
                        priceLimit: '10'
                    }
                ])
            ),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const service = createService(userRepository, orgRepository)

        const result = await service.findSummaries({ dimension: 'organization' })

        expect(result.items[0]).toMatchObject({
            dimension: 'organization',
            organizationId: 'org-1',
            tokenLimit: 5000,
            priceLimit: 10,
            userCount: 3
        })
    })

    it('increases a user quota without resetting current usage', async () => {
        const quotaRow = {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            orgId: null,
            userId: 'user-1',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD',
            tokenUsed: 25,
            tokenTotalUsed: 75,
            tokenLimit: 100
        } as CopilotUser
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock<CopilotUser>([])),
            find: jest.fn().mockResolvedValue([quotaRow]),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn(async (records) => records)
        }
        const orgRepository: RepositoryMock = {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const service = createService(userRepository, orgRepository)

        await service.adjustQuota({
            dimension: 'user',
            mode: 'increase',
            groupKey: {
                dimension: 'user',
                organizationId: 'org-1',
                userId: 'user-1',
                provider: 'openai',
                model: 'gpt-4.1',
                currency: 'USD'
            },
            tokenLimit: 50
        })

        expect(userRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                tokenUsed: 25,
                tokenTotalUsed: 75,
                tokenLimit: 150
            })
        ])
    })

    it('renews organization quota by rolling current usage into total usage', async () => {
        const quotaRow = {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD',
            tokenUsed: 25,
            tokenTotalUsed: 75,
            priceUsed: 0.25,
            priceTotalUsed: 0.75
        } as CopilotOrganization
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock<CopilotUser>([])),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const orgRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock<CopilotOrganization>([])),
            find: jest.fn().mockResolvedValue([quotaRow]),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn(async (records) => records)
        }
        const service = createService(userRepository, orgRepository)

        await service.renewQuota({
            dimension: 'organization',
            groupKey: {
                dimension: 'organization',
                organizationId: 'org-1',
                provider: 'openai',
                model: 'gpt-4.1',
                currency: 'USD'
            },
            tokenLimit: 1000,
            priceLimit: 2
        })

        expect(orgRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                tokenUsed: 0,
                tokenTotalUsed: 100,
                priceUsed: 0,
                priceTotalUsed: 1,
                tokenLimit: 1000,
                priceLimit: 2
            })
        ])
    })
})
