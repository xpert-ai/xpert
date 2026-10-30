import {
    MembershipLedgerSourceEnum,
    MembershipPeriodStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { MembershipPeriod } from '../membership-period.entity'
import {
    createMembership,
    createMembershipService,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: periods', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('lists membership periods from every scope for a tenant administrator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const periodRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            periodRepository as never
        )

        await service.findAdminUserPeriods('owner-user')

        expect(periodRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                userId: 'owner-user'
            },
            relations: ['plan'],
            order: { periodStart: 'ASC' }
        })
    })

    it('self-heals a missing active period projection for an organization membership', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({
            id: 'organization-free',
            organizationId: 'org-1',
            level: 0
        })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-free',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: plan.id,
                plan,
                source: MembershipSourceEnum.Organization
            })
        )

        const first = await service.ensureActiveMembershipPeriod({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            membershipId: 'membership-free'
        })
        const second = await service.ensureActiveMembershipPeriod({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            membershipId: 'membership-free'
        })

        expect(first.id).toBe(second.id)
        expect(periods).toHaveLength(1)
        expect(periods[0]).toMatchObject({
            membershipId: 'membership-free',
            planId: plan.id,
            status: MembershipPeriodStatusEnum.Active,
            source: MembershipSourceEnum.Organization
        })
    })

    it('synchronizes the active period before queuing a renewal after assigning a plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const oldPlan = createPlan({ id: 'plan-old', name: 'Old plan', includedPoints: 100 })
        const targetPlan = createPlan({ id: 'plan-target', name: 'Target plan', includedPoints: 300 })
        plans.push(oldPlan, targetPlan)
        const membership = createMembership({
            id: 'membership-reassigned',
            userId: 'user-1',
            planId: oldPlan.id,
            plan: oldPlan,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsGranted: 100,
            pointsUsed: 40
        })
        memberships.push(membership)
        periods.push({
            id: 'period-active-old',
            tenantId: 'tenant-1',
            organizationId: null,
            membershipId: membership.id,
            userId: membership.userId,
            planId: oldPlan.id,
            plan: oldPlan,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: membership.currentPeriodStart,
            periodEnd: membership.currentPeriodEnd,
            pointsGranted: 100,
            pointsUsed: 40,
            source: MembershipSourceEnum.Admin,
            renewalMode: MembershipRenewalModeEnum.Auto,
            sourceReference: null,
            sourceSequence: 0,
            planSnapshot: {
                planId: oldPlan.id,
                code: oldPlan.code,
                name: oldPlan.name,
                description: null,
                period: oldPlan.period,
                includedPoints: oldPlan.includedPoints,
                allowedModels: oldPlan.allowedModels,
                modelMultipliers: oldPlan.modelMultipliers,
                rateLimits: oldPlan.rateLimits
            }
        } as MembershipPeriod)

        await service.assignUser('user-1', {
            planId: targetPlan.id,
            currentPeriodStart: '2030-07-20T00:00:00.000Z',
            currentPeriodEnd: '2030-09-20T00:00:00.000Z',
            renewalMode: MembershipRenewalModeEnum.Manual
        })
        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: targetPlan.id,
            count: 1,
            source: MembershipSourceEnum.Admin,
            renewalMode: MembershipRenewalModeEnum.Manual
        })

        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)).toMatchObject({
            planId: targetPlan.id,
            periodStart: new Date('2030-07-20T00:00:00.000Z'),
            periodEnd: new Date('2030-09-20T00:00:00.000Z'),
            pointsGranted: 300,
            pointsUsed: 0,
            renewalMode: MembershipRenewalModeEnum.Manual,
            planSnapshot: {
                planId: targetPlan.id,
                name: targetPlan.name,
                includedPoints: targetPlan.includedPoints
            }
        })
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)).toMatchObject({
            planId: targetPlan.id,
            periodStart: new Date('2030-09-20T00:00:00.000Z')
        })
    })

    it('queues externally purchased renewal periods after a paused live period without consuming it', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paused-purchase', includedPoints: 100 })
        plans.push(plan)
        const membership = createMembership({
            id: 'membership-paused-purchase',
            userId: 'user-1',
            planId: plan.id,
            plan,
            status: MembershipStatusEnum.Paused,
            source: MembershipSourceEnum.External,
            renewalMode: MembershipRenewalModeEnum.Manual,
            currentPeriodStart: new Date('2030-07-01T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-01T00:00:00.000Z'),
            pointsUsed: 25
        })
        memberships.push(membership)
        periods.push({
            id: 'paused-live-period',
            tenantId: 'tenant-1',
            organizationId: null,
            membershipId: membership.id,
            userId: 'user-1',
            planId: plan.id,
            status: MembershipPeriodStatusEnum.Active,
            periodStart: membership.currentPeriodStart,
            periodEnd: membership.currentPeriodEnd,
            pointsGranted: 100,
            pointsUsed: 25,
            source: MembershipSourceEnum.External,
            renewalMode: MembershipRenewalModeEnum.Manual,
            sourceReference: 'original-order',
            sourceSequence: 0,
            planSnapshot: {
                planId: plan.id,
                code: plan.code,
                name: plan.name,
                description: plan.description,
                level: plan.level,
                catalogSourcePlanId: plan.catalogSourcePlanId,
                period: plan.period,
                includedPoints: plan.includedPoints,
                allowedModels: plan.allowedModels,
                modelMultipliers: plan.modelMultipliers,
                rateLimits: plan.rateLimits
            }
        } as MembershipPeriod)

        const appended = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 1,
            source: MembershipSourceEnum.External,
            sourceReference: 'renewal-order'
        })

        expect(membership).toMatchObject({
            status: MembershipStatusEnum.Paused,
            currentPeriodStart: new Date('2030-07-01T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-01T00:00:00.000Z'),
            pointsUsed: 25
        })
        expect(periods.find(({ id }) => id === 'paused-live-period')).toMatchObject({
            status: MembershipPeriodStatusEnum.Active,
            periodEnd: new Date('2030-08-01T00:00:00.000Z'),
            pointsUsed: 25
        })
        expect(appended).toEqual([
            expect.objectContaining({
                status: MembershipPeriodStatusEnum.Scheduled,
                periodStart: new Date('2030-08-01T00:00:00.000Z'),
                periodEnd: new Date('2030-09-01T00:00:00.000Z')
            })
        ])
    })

    it('appends multiple idempotent periods with immutable plan snapshots', async () => {
        const { ledgers, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({
            id: 'plan-prepaid',
            name: 'Original plan',
            includedPoints: 3000,
            allowedModels: [{ provider: 'openai', model: 'gpt-4.1' }]
        })
        plans.push(plan)

        const firstResult = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-1',
            actorId: 'buyer-1'
        })
        plan.name = 'Changed plan'
        plan.includedPoints = 9999
        const repeatedResult = await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plan.id,
            count: 3,
            source: MembershipSourceEnum.External,
            sourceReference: 'order-1',
            actorId: 'buyer-1'
        })

        expect(firstResult).toHaveLength(3)
        expect(repeatedResult.map(({ id }) => id)).toEqual(firstResult.map(({ id }) => id))
        expect(periods).toHaveLength(3)
        expect(periods.map(({ status }) => status)).toEqual([
            MembershipPeriodStatusEnum.Active,
            MembershipPeriodStatusEnum.Scheduled,
            MembershipPeriodStatusEnum.Scheduled
        ])
        expect(periods[0].planSnapshot).toMatchObject({
            name: 'Original plan',
            includedPoints: 3000,
            allowedModels: [{ provider: 'openai', model: 'gpt-4.1' }]
        })
        expect(periods[1].periodStart).toEqual(periods[0].periodEnd)
        expect(periods[2].periodStart).toEqual(periods[1].periodEnd)
        expect(ledgers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ actorId: 'buyer-1', reason: 'Membership period activated' }),
                expect.objectContaining({ actorId: 'buyer-1', reason: '3 membership periods scheduled' })
            ])
        )
    })

    it('requires external fulfillment to include a stable source reference', async () => {
        const { plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-external-reference', includedPoints: 100 })
        plans.push(plan)

        await expect(
            service.appendMembershipPeriods({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: plan.id,
                count: 1,
                source: MembershipSourceEnum.External
            })
        ).rejects.toThrow('Externally managed membership periods require a source reference.')
    })

    it('upgrades only the current period and keeps future prepaid periods unchanged', async () => {
        const { ledgers, memberships, periods, plans, service } = createScopeInitializationHarness()
        const plusPlan = createPlan({ id: 'plan-plus', name: 'Plus', includedPoints: 1000 })
        const proPlan = createPlan({ id: 'plan-pro', name: 'Pro', includedPoints: 5000 })
        plans.push(plusPlan, proPlan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plusPlan.id,
            count: 2,
            sourceReference: 'order-plus'
        })
        const upgraded = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-1',
            actorId: 'buyer-1'
        })
        const repeated = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-1',
            actorId: 'buyer-1'
        })

        expect(upgraded.plan.name).toBe('Pro')
        expect(upgraded.pointsGranted).toBe(2200)
        expect(repeated.pointsGranted).toBe(2200)
        expect(memberships).toHaveLength(1)
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)).toMatchObject({
            sourceReference: 'upgrade-1',
            planSnapshot: {
                name: 'Pro'
            }
        })
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)?.planSnapshot.name).toBe(
            'Plus'
        )
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                actorId: 'buyer-1',
                source: MembershipLedgerSourceEnum.Upgrade,
                sourceReference: 'upgrade-1'
            })
        )
    })

    it('preserves unlimited current-period points when upgrading to a finite plan', async () => {
        const { periods, plans, service } = createScopeInitializationHarness()
        const unlimitedPlan = createPlan({
            id: 'plan-unlimited',
            name: 'Unlimited',
            includedPoints: null
        })
        const finitePlan = createPlan({
            id: 'plan-finite',
            name: 'Finite',
            includedPoints: 5000
        })
        plans.push(unlimitedPlan, finitePlan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: unlimitedPlan.id,
            count: 1,
            sourceReference: 'order-unlimited'
        })
        const upgraded = await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: finitePlan.id,
            pointsDelta: 0,
            sourceReference: 'upgrade-finite'
        })

        expect(upgraded.pointsGranted).toBeNull()
        expect(periods.find(({ status }) => status === MembershipPeriodStatusEnum.Active)).toMatchObject({
            pointsGranted: null,
            sourceReference: 'upgrade-finite'
        })
    })

    it('rejects an upgrade idempotency key reused with different fulfillment parameters', async () => {
        const { plans, service } = createScopeInitializationHarness()
        const plusPlan = createPlan({ id: 'plan-idempotent-plus', name: 'Plus', includedPoints: 1000 })
        const proPlan = createPlan({ id: 'plan-idempotent-pro', name: 'Pro', includedPoints: 5000 })
        plans.push(plusPlan, proPlan)

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: plusPlan.id,
            count: 1,
            sourceReference: 'order-idempotent-plus'
        })
        await service.upgradeCurrentMembershipPeriod({
            tenantId: 'tenant-1',
            userId: 'user-1',
            planId: proPlan.id,
            pointsDelta: 1200,
            sourceReference: 'upgrade-idempotency'
        })

        await expect(
            service.upgradeCurrentMembershipPeriod({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: proPlan.id,
                pointsDelta: 1201,
                sourceReference: 'upgrade-idempotency'
            })
        ).rejects.toThrow('Membership upgrade request does not match the existing fulfillment.')
        await expect(
            service.upgradeCurrentMembershipPeriod({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: proPlan.id,
                pointsDelta: 1200,
                sourceReference: 'upgrade-idempotency'
            })
        ).rejects.toThrow('Membership upgrade request does not match the existing fulfillment.')
        await expect(
            service.upgradeCurrentMembershipPeriod({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: plusPlan.id,
                pointsDelta: 1200,
                sourceReference: 'upgrade-idempotency'
            })
        ).rejects.toThrow('Membership upgrade request does not match the existing fulfillment.')
    })
})
