import { OrderTypeEnum, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { CopilotOrganization } from '../copilot-organization/copilot-organization.entity'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
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

function createService(
    userRepository: RepositoryMock,
    orgRepository: RepositoryMock,
    ledgerRepository: RepositoryMock = {
        createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock<MembershipPointLedger>()),
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((input) => input),
        save: jest.fn()
    }
) {
    return new CopilotUsageService(
        userRepository as unknown as Repository<CopilotUser>,
        orgRepository as unknown as Repository<CopilotOrganization>,
        ledgerRepository as unknown as Repository<MembershipPointLedger>
    )
}

describe('CopilotUsageService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRequestContext()
    })

    it('summarizes user usage by xpert creator with current and grand totals', async () => {
        const qb = createQueryBuilderMock<CopilotUser>([
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'owner-user',
                provider: 'openai',
                model: 'gpt-4.1',
                currency: 'USD',
                tokenUsed: '40',
                tokenTotalUsed: '60',
                priceUsed: '0.4',
                priceTotalUsed: '0.6',
                tokenLimit: '1000',
                runtimeUserCount: '2',
                xpertCount: '3',
                updatedAt: new Date('2026-06-01T00:00:00.000Z'),
                userRelationId: 'owner-user',
                userEmail: 'owner@example.com',
                organizationRelationId: 'org-1',
                organizationName: 'Org 1',
                total: '1'
            }
        ])
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(qb),
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
        const membershipQb = createQueryBuilderMock<MembershipPointLedger>([
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'owner-user',
                provider: 'openai',
                model: 'gpt-4.1',
                membershipPointsUsed: '0.0285'
            }
        ])
        const ledgerRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(membershipQb),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const service = createService(userRepository, orgRepository, ledgerRepository)

        const result = await service.findSummaries(
            {
                dimension: 'user',
                start: '2026-06-01T00:00:00.000Z',
                end: '2026-06-01T23:59:59.999Z',
                provider: 'openai',
                model: 'gpt-4.1',
                userId: 'owner-user',
                currency: 'USD'
            },
            { order: { updatedAt: OrderTypeEnum.DESC }, take: 20, skip: 0 }
        )

        expect((qb as any).leftJoin).toHaveBeenCalledWith(
            'xpert',
            'usage_xpert',
            '"usage_xpert"."id"::text = "usage"."xpertId"'
        )
        expect((qb as any).addSelect).toHaveBeenCalledWith(
            'COALESCE("usage_xpert"."createdById"::text, "usage"."userId"::text)',
            'userId'
        )
        expect((qb as any).addSelect).toHaveBeenCalledWith('COUNT(DISTINCT "usage"."userId")', 'runtimeUserCount')
        expect((qb as any).addSelect).toHaveBeenCalledWith('COUNT(DISTINCT "usage"."xpertId")', 'xpertCount')
        expect(qb.addSelect).not.toHaveBeenCalledWith(expect.stringContaining('usage_membership'), expect.anything())
        expect(qb.leftJoin).not.toHaveBeenCalledWith(expect.any(Function), 'usage_membership', expect.anything())
        expect(membershipQb.addSelect).toHaveBeenCalledWith('SUM(ABS(ledger.pointsDelta))', 'membershipPointsUsed')
        expect(membershipQb.andWhere).toHaveBeenCalledWith('ledger.tenantId = :membershipTenantId', {
            membershipTenantId: 'tenant-1'
        })
        expect(membershipQb.andWhere).toHaveBeenCalledWith(
            'COALESCE(ledger.runtimeOrganizationId, ledger.organizationId) = :membershipScopeOrganizationId',
            { membershipScopeOrganizationId: 'org-1' }
        )
        expect(membershipQb.andWhere).toHaveBeenCalledWith('ledger.userId = :membershipUserId', {
            membershipUserId: 'owner-user'
        })
        expect(membershipQb.andWhere).toHaveBeenCalledWith('ledger.provider = :provider', { provider: 'openai' })
        expect(membershipQb.andWhere).toHaveBeenCalledWith('ledger.model = :model', { model: 'gpt-4.1' })
        expect(membershipQb.andWhere).toHaveBeenCalledWith('ledger.usageHour >= :usageStartHour', {
            usageStartHour: '2026-06-01 00'
        })
        expect(membershipQb.andWhere).toHaveBeenCalledWith('ledger.usageHour <= :usageEndHour', {
            usageEndHour: '2026-06-01 23'
        })
        expect(membershipQb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('ledger.userId = :membershipPageuser0'),
            expect.objectContaining({
                membershipPageorg0: 'org-1',
                membershipPageprovider0: 'openai',
                membershipPagemodel0: 'gpt-4.1',
                membershipPageuser0: 'owner-user'
            })
        )
        expect((qb as any).addGroupBy).toHaveBeenCalledWith(
            'COALESCE("usage_xpert"."createdById"::text, "usage"."userId"::text)'
        )
        expect(result.total).toBe(1)
        expect(result.items[0]).toMatchObject({
            dimension: 'user',
            organizationId: 'org-1',
            userId: 'owner-user',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD',
            tokenUsed: 40,
            membershipPointsUsed: 0.0285,
            tokenTotalUsed: 60,
            tokenGrandTotal: 100,
            priceUsed: 0.4,
            priceTotalUsed: 0.6,
            priceGrandTotal: 1,
            tokenLimit: null,
            priceLimit: null,
            runtimeUserCount: 2,
            xpertCount: 3
        })
    })

    it('filters usage summaries and totals by xpert creator user id', async () => {
        const summaryQb = createQueryBuilderMock<CopilotUser>([])
        const totalsQb = createQueryBuilderMock<CopilotUser>([])
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValueOnce(summaryQb).mockReturnValueOnce(totalsQb),
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

        await service.findSummaries({ dimension: 'user', userId: 'owner-user' })
        await service.findTotals({ dimension: 'user', userId: 'owner-user' })

        for (const qb of [summaryQb, totalsQb]) {
            expect((qb as any).andWhere).toHaveBeenCalledWith(
                'COALESCE("usage_xpert"."createdById"::text, "usage"."userId"::text) = :filterUserId',
                { filterUserId: 'owner-user' }
            )
        }
    })

    it('filters user details by creator but returns runtime user usage rows', async () => {
        const detail = {
            id: 'detail-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD',
            tokenUsed: 10
        }
        const qb = createQueryBuilderMock<CopilotUser>([detail])
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(qb),
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

        const result = await service.findDetails({
            dimension: 'user',
            organizationId: 'org-1',
            orgId: null,
            userId: 'owner-user',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD'
        })

        expect((qb as any).andWhere).toHaveBeenCalledWith(
            'COALESCE("usage_xpert"."createdById"::text, "usage"."userId"::text) = :groupUserId',
            { groupUserId: 'owner-user' }
        )
        expect(result[0]).toMatchObject({
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1'
        })
    })

    it('overlays organization quotas and membership points without joining them into usage rows', async () => {
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
        const ledgerRepository: RepositoryMock = {
            createQueryBuilder: jest.fn().mockReturnValue(
                createQueryBuilderMock<MembershipPointLedger>([
                    {
                        tenantId: 'tenant-1',
                        organizationId: 'org-1',
                        provider: 'openai',
                        model: 'gpt-4.1',
                        membershipPointsUsed: '1.5'
                    }
                ])
            ),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const service = createService(userRepository, orgRepository, ledgerRepository)

        const result = await service.findSummaries({ dimension: 'organization' })

        expect(result.items[0]).toMatchObject({
            dimension: 'organization',
            organizationId: 'org-1',
            membershipPointsUsed: 1.5,
            tokenLimit: 5000,
            priceLimit: 10,
            userCount: 3
        })
    })

    it('rejects quota changes for creator-aggregated user usage', async () => {
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

        await expect(
            service.adjustQuota({
                dimension: 'user',
                mode: 'increase',
                groupKey: {
                    dimension: 'user',
                    organizationId: 'org-1',
                    userId: 'owner-user',
                    provider: 'openai',
                    model: 'gpt-4.1',
                    currency: 'USD'
                },
                tokenLimit: 50
            })
        ).rejects.toThrow('Creator-aggregated user usage quota changes are not supported')

        expect(userRepository.find).not.toHaveBeenCalled()
        expect(userRepository.save).not.toHaveBeenCalled()
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
