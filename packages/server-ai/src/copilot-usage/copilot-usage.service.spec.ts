import { AiModelTypeEnum, MembershipLedgerSourceEnum, OrderTypeEnum, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { CopilotOrganization } from '../copilot-organization/copilot-organization.entity'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { CopilotUsageService } from './copilot-usage.service'
import { ModelUsageLedgerService } from './model-usage/model-usage-ledger.service'

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

function createQueryBuilderMock<T>(
    rawRows: Array<Record<string, unknown>> = [],
    rawOne: Record<string, unknown> | undefined = rawRows[0]
) {
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
        getRawOne: jest.fn().mockResolvedValue(rawOne),
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
    },
    modelUsageLedger: Pick<ModelUsageLedgerService, 'recordUsage' | 'getUsages' | 'findPage' | 'totals'> = {
        recordUsage: jest.fn(),
        getUsages: jest.fn(),
        findPage: jest.fn(),
        totals: jest.fn()
    }
) {
    return new CopilotUsageService(
        userRepository as unknown as Repository<CopilotUser>,
        orgRepository as unknown as Repository<CopilotOrganization>,
        ledgerRepository as unknown as Repository<MembershipPointLedger>,
        modelUsageLedger as ModelUsageLedgerService
    )
}

describe('CopilotUsageService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRequestContext()
    })

    it('exposes model usage recording and queries through the copilot usage interface', async () => {
        const repository: RepositoryMock = {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const usageResult = { requestId: 'request-1', recorded: true, ledgerIds: ['ledger-1'] }
        const page = { items: [], total: 0 }
        const modelUsageLedger: Pick<ModelUsageLedgerService, 'recordUsage' | 'getUsages' | 'findPage' | 'totals'> = {
            recordUsage: jest.fn().mockResolvedValue(usageResult),
            getUsages: jest.fn().mockResolvedValue([]),
            findPage: jest.fn().mockResolvedValue(page),
            totals: jest.fn().mockResolvedValue([])
        }
        const service = createService(repository, repository, undefined, modelUsageLedger)
        const scope = {
            tenantId: 'tenant-1',
            copilotId: 'copilot-1',
            providerScopeId: 'provider-scope-1',
            provider: 'volcengine'
        }
        const report = {
            requestId: 'request-1',
            model: 'seedream',
            modelType: AiModelTypeEnum.IMAGE,
            operation: 'text_to_image' as const,
            modality: 'image' as const,
            metrics: [{ unit: 'generation' as const, quantity: 1, authority: 'provider' as const }]
        }
        const pricingSnapshot = { capturedAt: '2026-08-15T00:00:00.000Z', rules: [] }

        await expect(service.recordModelUsage(scope, report, pricingSnapshot)).resolves.toEqual(usageResult)
        await expect(service.getModelUsages(['execution-1'], 'tenant-1')).resolves.toEqual([])
        await expect(service.findModelUsagePage({ unit: 'generation' })).resolves.toEqual(page)
        await expect(service.findModelUsageTotals({ unit: 'generation' })).resolves.toEqual([])

        expect(modelUsageLedger.recordUsage).toHaveBeenCalledWith(scope, report, pricingSnapshot)
        expect(modelUsageLedger.getUsages).toHaveBeenCalledWith(['execution-1'], 'tenant-1')
        expect(modelUsageLedger.findPage).toHaveBeenCalledWith({ unit: 'generation' }, undefined)
        expect(modelUsageLedger.totals).toHaveBeenCalledWith({ unit: 'generation' })
    })

    it('summarizes user usage by the billed user with current and grand totals', async () => {
        const qb = createQueryBuilderMock<CopilotUser>([
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'provider-org-1',
                userId: 'shared-user',
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
                userRelationId: 'shared-user',
                userEmail: 'shared@example.com',
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
                userId: 'shared-user',
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
                userId: 'shared-user',
                currency: 'USD'
            },
            { order: { updatedAt: OrderTypeEnum.DESC }, take: 20, skip: 0 }
        )

        expect(qb.leftJoin).not.toHaveBeenCalledWith('xpert', expect.anything(), expect.anything())
        expect(qb.addSelect).toHaveBeenCalledWith('"usage"."userId"::text', 'userId')
        expect(qb.addSelect).toHaveBeenCalledWith('COUNT(DISTINCT "usage"."userId")', 'runtimeUserCount')
        expect(qb.addSelect).toHaveBeenCalledWith('COUNT(DISTINCT "usage"."xpertId")', 'xpertCount')
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
            membershipUserId: 'shared-user'
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
                membershipPageuser0: 'shared-user'
            })
        )
        expect(qb.addGroupBy).toHaveBeenCalledWith('"usage"."userId"::text')
        expect(result.total).toBe(1)
        expect(result.items[0]).toMatchObject({
            dimension: 'user',
            organizationId: 'org-1',
            userId: 'shared-user',
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

    it('filters usage summaries and totals by billed user id', async () => {
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

        await service.findSummaries({ dimension: 'user', userId: 'shared-user' })
        await service.findTotals({ dimension: 'user', userId: 'shared-user' })

        for (const qb of [summaryQb, totalsQb]) {
            expect((qb as any).andWhere).toHaveBeenCalledWith('"usage"."userId"::text = :filterUserId', {
                filterUserId: 'shared-user'
            })
        }
    })

    it('returns daily token and membership point usage from the real ledger', async () => {
        const bucketQb = createQueryBuilderMock<MembershipPointLedger>([
            {
                day: new Date('2026-06-01T00:00:00.000Z'),
                provider: 'openai',
                model: 'gpt-4.1',
                tokenUsed: '1200',
                membershipPointsUsed: '2.75',
                callCount: '3'
            },
            {
                day: new Date('2026-06-01T00:00:00.000Z'),
                provider: 'anthropic',
                model: 'claude-3-5-sonnet',
                tokenUsed: '100',
                membershipPointsUsed: '0.25',
                callCount: '1'
            },
            {
                day: '2026-06-02T00:00:00.000Z',
                provider: 'openai',
                model: 'gpt-4.1',
                tokenUsed: '300',
                membershipPointsUsed: '0.5',
                callCount: '1'
            }
        ])
        const dailyQb = createQueryBuilderMock<MembershipPointLedger>([
            {
                day: new Date('2026-06-01T00:00:00.000Z'),
                tokenUsed: '1300',
                membershipPointsUsed: '3',
                callCount: '4',
                activeUsers: '2',
                conversationCount: '3'
            },
            {
                day: new Date('2026-06-02T00:00:00.000Z'),
                tokenUsed: '300',
                membershipPointsUsed: '0.5',
                callCount: '1',
                activeUsers: '1',
                conversationCount: '1'
            }
        ])
        const totalsQb = createQueryBuilderMock<MembershipPointLedger>([], {
            totalCalls: '5',
            activeUsers: '2',
            totalConversations: '4'
        })
        const availableModelsQb = createQueryBuilderMock<MembershipPointLedger>([
            { provider: 'openai', model: 'gpt-4.1' },
            { provider: 'anthropic', model: 'claude-3-5-sonnet' }
        ])
        const userRepository: RepositoryMock = {
            createQueryBuilder: jest.fn(),
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
        const ledgerRepository: RepositoryMock = {
            createQueryBuilder: jest
                .fn()
                .mockReturnValueOnce(bucketQb)
                .mockReturnValueOnce(dailyQb)
                .mockReturnValueOnce(totalsQb)
                .mockReturnValueOnce(availableModelsQb),
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn()
        }
        const service = createService(userRepository, orgRepository, ledgerRepository)

        const result = await service.findOverview({
            start: '2026-06-01T00:00:00.000Z',
            end: '2026-06-02T23:59:59.999Z',
            provider: 'openai',
            model: 'gpt-4.1',
            userId: 'user-1',
            xpertId: 'xpert-1'
        })

        expect(bucketQb.where).toHaveBeenCalledWith('ledger.source IN (:...membershipUsageSources)', {
            membershipUsageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
        })
        expect(bucketQb.andWhere).toHaveBeenCalledWith('ledger.userId = :membershipUserId', {
            membershipUserId: 'user-1'
        })
        expect(bucketQb.andWhere).toHaveBeenCalledWith('ledger.xpertId = :membershipXpertId', {
            membershipXpertId: 'xpert-1'
        })
        expect(bucketQb.andWhere).toHaveBeenCalledWith('ledger.provider = :provider', { provider: 'openai' })
        expect(bucketQb.andWhere).toHaveBeenCalledWith('ledger.model = :model', { model: 'gpt-4.1' })
        expect(availableModelsQb.andWhere).not.toHaveBeenCalledWith('ledger.model = :model', expect.anything())
        expect(result).toEqual({
            totalTokens: 1600,
            totalMembershipPoints: 3.5,
            totalCalls: 5,
            activeUsers: 2,
            totalConversations: 4,
            activeDays: 2,
            buckets: [
                {
                    date: '2026-06-01',
                    provider: 'openai',
                    model: 'gpt-4.1',
                    tokenUsed: 1200,
                    membershipPointsUsed: 2.75,
                    callCount: 3
                },
                {
                    date: '2026-06-01',
                    provider: 'anthropic',
                    model: 'claude-3-5-sonnet',
                    tokenUsed: 100,
                    membershipPointsUsed: 0.25,
                    callCount: 1
                },
                {
                    date: '2026-06-02',
                    provider: 'openai',
                    model: 'gpt-4.1',
                    tokenUsed: 300,
                    membershipPointsUsed: 0.5,
                    callCount: 1
                }
            ],
            daily: [
                {
                    date: '2026-06-01',
                    tokenUsed: 1300,
                    membershipPointsUsed: 3,
                    callCount: 4,
                    activeUsers: 2,
                    conversationCount: 3
                },
                {
                    date: '2026-06-02',
                    tokenUsed: 300,
                    membershipPointsUsed: 0.5,
                    callCount: 1,
                    activeUsers: 1,
                    conversationCount: 1
                }
            ],
            modelUsage: [
                {
                    provider: 'openai',
                    model: 'gpt-4.1',
                    tokenUsed: 1500,
                    membershipPointsUsed: 3.25,
                    callCount: 4
                },
                {
                    provider: 'anthropic',
                    model: 'claude-3-5-sonnet',
                    tokenUsed: 100,
                    membershipPointsUsed: 0.25,
                    callCount: 1
                }
            ],
            availableModels: [
                { provider: 'openai', model: 'gpt-4.1' },
                { provider: 'anthropic', model: 'claude-3-5-sonnet' }
            ]
        })
    })

    it('filters user details by billed user', async () => {
        const detail = {
            id: 'detail-1',
            userId: 'shared-user',
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
            userId: 'shared-user',
            provider: 'openai',
            model: 'gpt-4.1',
            currency: 'USD'
        })

        expect((qb as any).andWhere).toHaveBeenCalledWith('"usage"."userId"::text = :groupUserId', {
            groupUserId: 'shared-user'
        })
        expect(result[0]).toMatchObject({
            userId: 'shared-user',
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

    it('adjusts quota for billed user usage', async () => {
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
                    userId: 'user-1',
                    provider: 'openai',
                    model: 'gpt-4.1',
                    currency: 'USD'
                },
                tokenLimit: 50
            })
        ).resolves.toBeNull()

        expect(userRepository.find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                provider: 'openai',
                model: 'gpt-4.1',
                currency: 'USD'
            })
        })
        expect(userRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                userId: 'user-1',
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
