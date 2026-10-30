jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))
import { MembershipLedgerSourceEnum, MembershipStatusEnum, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    createMembership,
    createMembershipFeatureRepository,
    createMembershipService,
    createPlan,
    createQueryBuilder
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'

describe('MembershipService: usage', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('summarizes membership usage by hourly thread and model group', async () => {
        const queryBuilder = createQueryBuilder([
            {
                usageHour: '2026-06-30 14',
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                organizationId: 'org-1',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1',
                conversationTitle: 'Quarterly Planning',
                xpertTitle: 'Research Assistant',
                xpertName: 'research-assistant',
                callCount: '9',
                pointsDelta: '-14',
                pointsUsed: '14',
                tokenUsed: '99087',
                firstUsedAt: new Date('2026-06-30T14:45:04.000Z'),
                lastUsedAt: new Date('2026-06-30T14:47:20.000Z'),
                total: '1'
            }
        ])
        const ledgerRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )

        const result = await service.findUserUsageSummaries(
            'tenant-1',
            'user-1',
            { usageChannel: ModelGatewayUsageChannelEnum.ExternalApi },
            { take: 20, skip: 0 }
        )

        expect(result.total).toBe(1)
        expect(result.items[0]).toMatchObject({
            usageHour: '2026-06-30 14',
            usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
            provider: 'tongyi',
            model: 'qwen3.6-plus',
            organizationId: 'org-1',
            xpertId: 'xpert-1',
            threadId: 'thread-1',
            copilotId: 'copilot-1',
            conversationTitle: 'Quarterly Planning',
            xpertTitle: 'Research Assistant',
            xpertName: 'research-assistant',
            callCount: 9,
            pointsDelta: -14,
            pointsUsed: 14,
            tokenUsed: 99087,
            groupKey: {
                usageHour: '2026-06-30 14',
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                organizationId: 'org-1',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1'
            }
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ledger.source IN (:...usageSources)', {
            usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('ledger.usageChannel = :usageChannel', {
            usageChannel: ModelGatewayUsageChannelEnum.ExternalApi
        })
        expect(queryBuilder.addSelect).toHaveBeenCalledWith(
            'COUNT(ledger.id) FILTER (WHERE COALESCE(ledger.tokenUsed, 0) > 0)',
            'callCount'
        )
        expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
            'chat_conversation',
            'conversation',
            '"conversation"."tenantId" = ledger."tenantId" AND "conversation"."threadId" = ledger."threadId"'
        )
        expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
            'xpert',
            'usage_xpert',
            '"usage_xpert"."tenantId" = ledger."tenantId" AND "usage_xpert"."id"::text = ledger."xpertId"'
        )
        expect(queryBuilder.groupBy).toHaveBeenCalledWith('ledger.usageHour')
        expect(queryBuilder.addSelect).toHaveBeenCalledWith('ledger.usageChannel', 'usageChannel')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.usageChannel')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.provider')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.model')
        expect(queryBuilder.addGroupBy).toHaveBeenCalledWith('ledger.threadId')
        expect(queryBuilder.orderBy).toHaveBeenCalledWith('MAX(ledger.createdAt)', 'DESC')
    })

    it('summarizes all user usage without limiting the overview to the current membership scope', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const queryBuilder = createQueryBuilder([
            {
                day: '2026-07-23T00:00:00.000Z',
                pointsUsed: '1',
                tokenUsed: '1000'
            }
        ])
        const ledgerRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )
        const membership = createMembership({ organizationId: 'org-1' })
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })

        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(10)
        jest.spyOn(getMembershipFixture(service).usage, 'findTopLedgerRanks').mockResolvedValue([])

        const overview = await service.getOverview({
            start: '2026-07-01T00:00:00.000Z',
            end: '2026-07-31T23:59:59.999Z'
        })

        expect(overview?.buckets).toEqual([{ date: '2026-07-23', pointsUsed: 1, tokenUsed: 1000 }])
        expect(overview).toMatchObject({ totalTokens: 1000, peakDailyTokens: 1000, activeDays: 1 })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(usagePoints.USAGE_POINTS_PREDICATE)
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
            '(ledger.membershipId = :membershipId OR (ledger.membershipId IS NULL AND ledger.source = :personalUsageSource))',
            expect.anything()
        )
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith('ledger.organizationId = :organizationId', {
            organizationId: 'org-1'
        })
    })

    it('lists the current user usage across membership scopes', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService()
        const membership = createMembership({ organizationId: 'org-1' })
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })
        const usage = { items: [], total: 0 }
        const summaries = { items: [], total: 0 }
        jest.spyOn(getMembershipFixture(service).usage, 'findUserUsage').mockResolvedValue(usage)
        jest.spyOn(getMembershipFixture(service).usage, 'findUserUsageSummaries').mockResolvedValue(summaries)

        await expect(service.findMyUsage()).resolves.toBe(usage)
        await expect(service.findMyUsageSummaries()).resolves.toBe(summaries)

        expect(getMembershipFixture(service).usage.findUserUsage).toHaveBeenCalledWith(
            'tenant-1',
            'owner-user',
            undefined,
            undefined
        )
        expect(getMembershipFixture(service).usage.findUserUsageSummaries).toHaveBeenCalledWith(
            'tenant-1',
            'owner-user',
            undefined,
            undefined
        )
    })

    it('keeps historical usage available without current membership access', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService()
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).access, 'findMembershipPresentationAccess').mockResolvedValue(null)
        const usage = { items: [], total: 0 }
        jest.spyOn(getMembershipFixture(service).usage, 'findUserUsage').mockResolvedValue(usage)

        await expect(service.findMyUsage()).resolves.toBe(usage)
        expect(getMembershipFixture(service).usage.findUserUsage).toHaveBeenCalledWith(
            'tenant-1',
            'owner-user',
            undefined,
            undefined
        )
    })

    it('builds historical usage overview without current membership access', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const queryBuilder = createQueryBuilder([
            {
                day: '2026-07-23T00:00:00.000Z',
                pointsUsed: '1',
                tokenUsed: '1000'
            }
        ])
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
            {} as never
        )

        jest.spyOn(getMembershipFixture(service).access, 'findMembershipPresentationAccess').mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).usage, 'findTopLedgerRanks').mockResolvedValue([])

        const overview = await service.getOverview({
            start: '2026-07-01T00:00:00.000Z',
            end: '2026-07-31T23:59:59.999Z'
        })

        expect(overview).toMatchObject({
            totalTokens: 1000,
            peakDailyTokens: 1000,
            activeDays: 1,
            buckets: [{ date: '2026-07-23', pointsUsed: 1, tokenUsed: 1000 }]
        })
    })

    it('reports unlimited model consumption without changing quota deductions', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService()
        const membership = createMembership({ pointsGranted: null, pointsUsed: 0 })
        jest.spyOn(getMembershipFixture(service).access, 'findMembershipPresentationAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership
        })
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(20)
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(18.375)
        await expect(service.getMe()).resolves.toMatchObject({
            consumedPoints: 18.375,
            pointsUsed: 0,
            pointsRemaining: null,
            personalPointsBalance: 20
        })
        expect(usagePoints.readPeriodConsumedPoints).toHaveBeenCalledWith(expect.anything(), undefined, {
            tenantId: 'tenant-1',
            userId: membership.userId,
            currentPeriodStart: membership.currentPeriodStart,
            currentPeriodEnd: membership.currentPeriodEnd
        })
    })

    it('returns an expired membership with zero personal points and falls back when its plan was deleted', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const fallbackPlan = createPlan({ id: 'plan-free', code: 'free', name: 'Free' })
        const expiredMembership = createMembership({
            planId: null,
            plan: undefined,
            status: MembershipStatusEnum.Expired
        })
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue(null)

        jest.spyOn(getMembershipFixture(service).records, 'findMembershipForUpdate').mockResolvedValue(
            expiredMembership
        )
        jest.spyOn(getMembershipFixture(service).records, 'findDefaultPlan').mockResolvedValue(fallbackPlan)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

        const me = await service.getMe()

        expect(me).toMatchObject({
            membership: {
                status: MembershipStatusEnum.Expired,
                planId: 'plan-free',
                plan: fallbackPlan
            },
            plan: fallbackPlan,
            personalPointsBalance: 0
        })
    })

    it('keeps the latest membership visible when the membership feature is disabled', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const membership = createMembership({
            organizationId: 'org-1',
            status: MembershipStatusEnum.Expired
        })
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository as never
        )
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue(null)

        jest.spyOn(getMembershipFixture(service).records, 'findMembershipForUpdate').mockResolvedValue(membership)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

        await expect(service.getMe()).resolves.toMatchObject({
            membership,
            plan: membership.plan,
            personalPointsBalance: 0
        })
    })

    it('returns the persisted expired membership and personal balance for display', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-user')
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const expiredMembership = createMembership({
            status: MembershipStatusEnum.Expired,
            pointsGranted: 100,
            pointsUsed: 0
        })
        const accessMembership = createMembership({
            status: MembershipStatusEnum.Active,
            pointsGranted: 0,
            pointsUsed: 0
        })
        jest.spyOn(getMembershipFixture(service).access, 'findModelAccess').mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: accessMembership,
            persistedMembership: expiredMembership,
            personalPointsOnly: true
        })

        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(10.673)

        const me = await service.getMe()

        expect(me).toMatchObject({
            membership: expiredMembership,
            plan: expiredMembership.plan,
            personalPointsOnly: true,
            pointsGranted: 100,
            pointsUsed: 0,
            pointsRemaining: 100,
            personalPointsBalance: 10.673
        })
    })
})
