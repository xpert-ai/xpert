import {
    MembershipPeriodStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { MembershipPeriod } from '../membership-period.entity'
import {
    createMembership,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: refunds', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('revokes a paid membership while preserving future periods for billing refunds', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan',
            level: 1
        })
        const snapshot = {
            planId: paidPlan.id,
            code: paidPlan.code,
            name: paidPlan.name,
            description: null,
            level: paidPlan.level,
            catalogSourcePlanId: paidPlan.catalogSourcePlanId,
            period: paidPlan.period,
            includedPoints: paidPlan.includedPoints,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        }
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                planSnapshot: snapshot,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual
            })
        )
        periods.push(
            {
                id: 'current-paid-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: new Date('2026-07-01T00:00:00.000Z'),
                periodEnd: new Date('2026-08-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 10,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 0,
                planSnapshot: snapshot
            } as MembershipPeriod,
            {
                id: 'future-paid-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Scheduled,
                periodStart: new Date('2030-08-01T00:00:00.000Z'),
                periodEnd: new Date('2030-09-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 0,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 1,
                planSnapshot: snapshot
            } as MembershipPeriod
        )

        const revoked = await service.revokeUser('user-1')
        expect(revoked.status).toBe(MembershipStatusEnum.Expired)
        expect(periods.find(({ id }) => id === 'future-paid-period')).toMatchObject({
            status: MembershipPeriodStatusEnum.Scheduled
        })

        const reserved = await service.reserveFutureMembershipPeriodsForRefund({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            sourceReference: 'order-paid'
        })

        expect(reserved).toEqual([
            expect.objectContaining({
                id: 'future-paid-period',
                status: MembershipPeriodStatusEnum.RefundPending
            })
        ])
        expect(periods.find(({ id }) => id === 'current-paid-period')).toMatchObject({
            status: MembershipPeriodStatusEnum.Completed
        })
    })

    it('lets admins cancel assigned future periods without deleting them', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-admin-period', includedPoints: 100 })
        plans.push(plan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 2,
            source: MembershipSourceEnum.Admin
        })
        const scheduledPeriod = periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
        if (!scheduledPeriod) {
            throw new Error('Expected a scheduled membership period.')
        }

        const cancelled = await service.cancelAdminUserPeriod('user-1', scheduledPeriod.id)

        expect(cancelled.status).toBe(MembershipPeriodStatusEnum.Cancelled)
        expect(periods).toContainEqual(expect.objectContaining({ id: scheduledPeriod.id }))
    })

    it('only lets admins cancel the last scheduled period', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-tail-cancel', includedPoints: 100 })
        plans.push(plan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.Admin
        })
        const scheduledPeriods = periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
        if (scheduledPeriods.length !== 2) {
            throw new Error('Expected two scheduled membership periods.')
        }

        await expect(service.cancelAdminUserPeriod('user-1', scheduledPeriods[0].id)).rejects.toThrow(
            'Only the last scheduled membership period can be cancelled.'
        )

        const cancelled = await service.cancelAdminUserPeriod('user-1', scheduledPeriods[1].id)

        expect(cancelled.status).toBe(MembershipPeriodStatusEnum.Cancelled)
        expect(scheduledPeriods[0].status).toBe(MembershipPeriodStatusEnum.Scheduled)
    })

    it('requires externally managed periods to be cancelled with their source reference', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paid-period', includedPoints: 100 })
        plans.push(plan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 2,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-paid'
        })
        const scheduledPeriod = periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
        if (!scheduledPeriod) {
            throw new Error('Expected a scheduled membership period.')
        }

        await expect(service.cancelAdminUserPeriod('user-1', scheduledPeriod.id)).rejects.toThrow(
            'Externally managed periods must be refunded and cancelled by the external billing system.'
        )

        const cancelled = await service.cancelScheduledMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            periodId: scheduledPeriod.id,
            sourceReference: 'order-paid'
        })

        expect(cancelled.status).toBe(MembershipPeriodStatusEnum.Cancelled)
    })
})
