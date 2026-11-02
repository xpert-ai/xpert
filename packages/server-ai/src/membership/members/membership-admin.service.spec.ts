import { ForbiddenException } from '@nestjs/common'
import {
    MembershipLedgerSourceEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { MembershipPeriod } from '../membership-period.entity'
import {
    createMembership,
    createMembershipFeatureRepository,
    createMembershipService,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'
import { UserMembership } from '../user-membership.entity'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: admin', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('includes the selected tenant-local day in the admin member expiration filter', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const membershipSubquery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('SELECT candidate.id')
        }
        const userQueryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            subQuery: jest.fn(() => membershipSubquery),
            leftJoinAndMapOne: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const userRepository = {
            createQueryBuilder: jest.fn(() => userQueryBuilder)
        }
        const organizationRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'default-org',
                timeZone: 'Asia/Shanghai'
            })
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            userRepository as never,
            undefined,
            undefined,
            createMembershipFeatureRepository().repository as never,
            undefined,
            undefined,
            organizationRepository as never
        )

        await service.findAdminMembers({ expiringBefore: '2027-03-14' })

        expect(organizationRepository.findOne).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', isDefault: true },
            select: { id: true, timeZone: true }
        })
        expect(userQueryBuilder.andWhere).toHaveBeenCalledWith('membership.currentPeriodEnd <= :expiringBefore', {
            expiringBefore: new Date('2027-03-14T15:59:59.999Z')
        })
    })

    it('uses a unique tie-breaker when paginating assigned plan members', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )

        await service.findAdminUsers({ planId: 'plan-1', take: 20, skip: 20 })

        expect(queryBuilder.orderBy).toHaveBeenCalledWith('membership.updatedAt', 'DESC')
        expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('membership.id', 'DESC')
    })

    it('lists the current tenant and organization memberships for a tenant administrator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const tenantMembership = createMembership({
            id: 'membership-tenant',
            organizationId: null,
            plan: createPlan({ id: 'plan-tenant', name: 'Tenant plan' })
        })
        const organizationMembership = createMembership({
            id: 'membership-org',
            organizationId: 'org-1',
            organization: { id: 'org-1', name: 'Organization 1' } as UserMembership['organization'],
            plan: createPlan({ id: 'plan-org', organizationId: 'org-1', name: 'Organization plan' })
        })
        const duplicateOrganizationMembership = createMembership({
            id: 'membership-org-older',
            organizationId: 'org-1',
            organization: { id: 'org-1', name: 'Organization 1' } as UserMembership['organization'],
            status: MembershipStatusEnum.Paused
        })
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            getMany: jest
                .fn()
                .mockResolvedValue([tenantMembership, organizationMembership, duplicateOrganizationMembership])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )

        const memberships = await service.findAdminUserScopeMemberships('owner-user')

        expect(memberships.map(({ id }) => id)).toEqual(['membership-tenant', 'membership-org'])
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('membership.organization', 'organization')
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('membership.status IN (:...statuses)', {
            statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
        })
    })

    it('does not expose cross-organization memberships from organization scope', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = createMembershipService()

        await expect(service.findAdminUserScopeMemberships('owner-user')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('lists membership audit entries from every scope for a tenant administrator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const queryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const ledgerRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            ledgerRepository as never,
            {} as never
        )

        await service.findAdminUserAudit('owner-user')

        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('ledger.user', 'user')
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('ledger.membership', 'membership')
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('membership.organization', 'organization')
        expect(queryBuilder.andWhere).not.toHaveBeenCalledWith('ledger.organizationId IS NULL')
    })

    it('does not grant or assign membership plans to technical users', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { dataSource, service, userRepository } = createScopeInitializationHarness()
        userRepository.findOne.mockResolvedValue(null)

        await expect(
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'technical-user' })
        ).resolves.toBeNull()
        await expect(
            service.assignUser('technical-user', {
                planId: 'plan-1'
            })
        ).rejects.toThrow('Technical users cannot have membership plans.')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('pauses and revokes a managed membership without replacing it', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            getRepository: jest.fn((entity) => (entity === UserMembership ? membershipRepository : {}))
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership()
        jest.spyOn(getMembershipFixture(service).records, 'requireManagedMembership').mockResolvedValue(membership)
        jest.spyOn(getMembershipFixture(service).records, 'createMembershipStatusLedger').mockResolvedValue(undefined)
        jest.spyOn(getMembershipFixture(service).records, 'findMembershipById').mockImplementation(
            async () => membership
        )

        const paused = await service.pauseUser(membership.userId)
        expect(paused.status).toBe(MembershipStatusEnum.Paused)
        expect(paused.id).toBe(membership.id)

        const revoked = await service.revokeUser(membership.userId)
        expect(revoked.status).toBe(MembershipStatusEnum.Expired)
        expect(revoked.id).toBe(membership.id)
        expect(revoked.currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('expires an organization membership when the user is removed from that organization', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const manager = {
            connection: { options: { type: 'sqlite' } },
            getRepository: jest.fn((entity) => (entity === UserMembership ? membershipRepository : {}))
        }
        const dataSource = {
            transaction: jest.fn((callback) => callback(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership({
            organizationId: 'org-1',
            userId: 'user-1'
        })
        jest.spyOn(getMembershipFixture(service).records, 'findMembershipForUpdate').mockResolvedValue(membership)
        const createStatusLedger = jest
            .spyOn(getMembershipFixture(service).records, 'createMembershipStatusLedger')
            .mockResolvedValue(undefined)

        const revoked = await service.revokeOrganizationMembershipForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(revoked).toMatchObject({
            id: membership.id,
            status: MembershipStatusEnum.Expired
        })
        expect(membershipRepository.save).toHaveBeenCalledWith(membership)
        expect(createStatusLedger).toHaveBeenCalledWith(manager, membership, 'Organization membership removed')
        expect(membership.currentPeriodEnd.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('keeps paid future periods without blocking organization membership removal', async () => {
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paid-org', organizationId: 'org-1' })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-paid-org',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: plan.id,
                plan,
                currentPeriodStart: new Date('2030-07-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2030-08-01T00:00:00.000Z')
            })
        )

        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            planId: plan.id,
            count: 1,
            source: MembershipSourceEnum.Admin
        })
        await service.appendMembershipPeriods({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            planId: plan.id,
            count: 1,
            source: MembershipSourceEnum.External,
            sourceReference: 'paid-org-period'
        })

        const revoked = await service.revokeOrganizationMembershipForRemovedUser({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(revoked?.status).toBe(MembershipStatusEnum.Expired)
        expect(
            periods.find(
                (period) =>
                    period.source === MembershipSourceEnum.Admin &&
                    period.status === MembershipPeriodStatusEnum.Cancelled
            )
        ).toBeDefined()
        expect(
            periods.find(
                (period) =>
                    period.source === MembershipSourceEnum.External && period.sourceReference === 'paid-org-period'
            )
        ).toMatchObject({ status: MembershipPeriodStatusEnum.Scheduled })
    })

    it('reuses a paused membership record when assigning a new plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { memberships, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-target' })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-paused',
                userId: 'user-1',
                status: MembershipStatusEnum.Paused,
                planId: plan.id,
                plan
            })
        )

        const assigned = await service.assignUser('user-1', { planId: plan.id })

        expect(assigned).toMatchObject({
            id: 'membership-paused',
            status: MembershipStatusEnum.Active,
            planId: 'plan-target'
        })
        expect(memberships).toHaveLength(1)
    })

    it('rejects manually assigning a catalog-managed organization plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { plans, service } = createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'catalog-clone',
                organizationId: 'org-1',
                catalogSourcePlanId: 'catalog-plan'
            })
        )

        await expect(service.assignUser('user-1', { planId: 'catalog-clone' })).rejects.toThrow(
            'Membership plan not found.'
        )
    })

    it('does not let admin assignment overwrite a purchased membership', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { memberships, plans, service } = createScopeInitializationHarness()
        const targetPlan = createPlan({
            id: 'managed-plan',
            organizationId: 'org-1'
        })
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(targetPlan, paidPlan)
        memberships.push(
            createMembership({
                id: 'paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                source: MembershipSourceEnum.External
            })
        )

        await expect(service.assignUser('user-1', { planId: targetPlan.id })).rejects.toThrow(
            'Purchased memberships must be renewed through billing.'
        )
        expect(memberships[0]).toMatchObject({
            planId: paidPlan.id,
            source: MembershipSourceEnum.External
        })
    })

    it('rejects an assignment whose end date is not after its start date', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-target' })
        plans.push(plan)

        await expect(
            service.assignUser('user-1', {
                planId: plan.id,
                currentPeriodStart: '2026-08-02T00:00:00.000Z',
                currentPeriodEnd: '2026-08-01T00:00:00.000Z'
            })
        ).rejects.toThrow('Membership period end must be later than its start.')
    })

    it('rejects assigning an organization plan to a user outside the current organization', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { plans, service, userOrganizationRepository } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-target', organizationId: 'org-1' }))
        userOrganizationRepository.findOne.mockResolvedValue(null)

        await expect(service.assignUser('user-1', { planId: 'plan-target' })).rejects.toThrow(
            'The user is not an active member of the current organization.'
        )
    })

    it('expires other current memberships when assigning a plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('admin-1')
        const { ledgers, memberships, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-target' })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-old',
                userId: 'user-1',
                planId: 'plan-old',
                updatedAt: new Date('2026-07-01T00:00:00.000Z')
            }),
            createMembership({
                id: 'membership-current',
                userId: 'user-1',
                planId: plan.id,
                plan,
                updatedAt: new Date('2026-07-02T00:00:00.000Z')
            })
        )

        const assigned = await service.assignUser('user-1', { planId: plan.id })

        expect(assigned.id).toBe('membership-current')
        expect(memberships.find(({ id }) => id === 'membership-old')?.status).toBe(MembershipStatusEnum.Expired)
        expect(memberships.filter(({ status }) => status === MembershipStatusEnum.Active)).toHaveLength(1)
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                membershipId: 'membership-old',
                source: MembershipLedgerSourceEnum.StatusChange,
                reason: 'Duplicate current membership replaced'
            })
        )
    })

    it('queues early renewals without resetting the current membership period', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-renew' })
        plans.push(plan)
        const membership = createMembership({
            id: 'membership-renew',
            userId: 'user-1',
            planId: plan.id,
            plan,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsUsed: 25
        })
        memberships.push(membership)

        const renewed = await service.renewUser('user-1')

        expect(renewed.currentPeriodStart).toEqual(new Date('2030-07-10T00:00:00.000Z'))
        expect(renewed.currentPeriodEnd).toEqual(new Date('2030-08-10T00:00:00.000Z'))
        expect(renewed.pointsUsed).toBe(25)
        expect(periods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Active,
                    periodStart: new Date('2030-07-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-08-10T00:00:00.000Z'),
                    pointsUsed: 25
                }),
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Scheduled,
                    periodStart: new Date('2030-08-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-09-10T00:00:00.000Z'),
                    pointsUsed: 0
                })
            ])
        )

        membership.plan.status = MembershipPlanStatusEnum.Archived
        await expect(service.renewUser('user-1')).rejects.toThrow('Archived membership plans cannot be renewed.')
    })

    it('rejects admin renewal of a purchased membership', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                source: MembershipSourceEnum.External
            })
        )

        await expect(service.renewUser('user-1')).rejects.toThrow(
            'Purchased memberships must be renewed through billing.'
        )
        expect(periods).toHaveLength(0)
    })

    it('does not renew an expired purchased membership when resuming it', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const { memberships, periods, plans, service } = createScopeInitializationHarness()
        const paidPlan = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(paidPlan)
        memberships.push(
            createMembership({
                id: 'paused-paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                source: MembershipSourceEnum.External,
                status: MembershipStatusEnum.Paused,
                currentPeriodStart: new Date('2020-06-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2020-07-01T00:00:00.000Z')
            })
        )

        await expect(service.resumeUser('user-1')).rejects.toThrow(
            'Purchased memberships must be renewed through billing.'
        )
        expect(periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)).toHaveLength(0)
    })

    it('activates a paid scheduled period when resuming after the current period expired', async () => {
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
                id: 'paused-paid-membership',
                organizationId: 'org-1',
                userId: 'user-1',
                planId: paidPlan.id,
                plan: paidPlan,
                planSnapshot: snapshot,
                source: MembershipSourceEnum.External,
                status: MembershipStatusEnum.Paused,
                currentPeriodStart: new Date('2020-06-01T00:00:00.000Z'),
                currentPeriodEnd: new Date('2020-07-01T00:00:00.000Z')
            })
        )
        periods.push(
            {
                id: 'expired-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paused-paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: new Date('2020-06-01T00:00:00.000Z'),
                periodEnd: new Date('2020-07-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 10,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 0,
                planSnapshot: snapshot
            } as MembershipPeriod,
            {
                id: 'paid-scheduled-period',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                membershipId: 'paused-paid-membership',
                userId: 'user-1',
                planId: paidPlan.id,
                status: MembershipPeriodStatusEnum.Scheduled,
                periodStart: new Date('2020-07-01T00:00:00.000Z'),
                periodEnd: new Date('2030-07-01T00:00:00.000Z'),
                pointsGranted: 100,
                pointsUsed: 0,
                source: MembershipSourceEnum.External,
                renewalMode: MembershipRenewalModeEnum.Manual,
                sourceReference: 'order-paid',
                sourceSequence: 1,
                planSnapshot: snapshot
            } as MembershipPeriod
        )

        const resumed = await service.resumeUser('user-1')

        expect(resumed).toMatchObject({
            status: MembershipStatusEnum.Active,
            currentPeriodEnd: new Date('2030-07-01T00:00:00.000Z'),
            source: MembershipSourceEnum.External
        })
        expect(periods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'expired-period',
                    status: MembershipPeriodStatusEnum.Completed
                }),
                expect.objectContaining({
                    id: 'paid-scheduled-period',
                    status: MembershipPeriodStatusEnum.Active
                })
            ])
        )
    })

    it('resumes a paused membership when renewing without resetting the current period', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { ledgers, memberships, periods, plans, service } = createScopeInitializationHarness()
        const plan = createPlan({ id: 'plan-paused-renew' })
        plans.push(plan)
        const membership = createMembership({
            id: 'membership-paused-renew',
            userId: 'user-1',
            planId: plan.id,
            plan,
            status: MembershipStatusEnum.Paused,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsUsed: 25
        })
        memberships.push(membership)

        const renewed = await service.renewUser('user-1')

        expect(renewed).toMatchObject({
            status: MembershipStatusEnum.Active,
            currentPeriodStart: new Date('2030-07-10T00:00:00.000Z'),
            currentPeriodEnd: new Date('2030-08-10T00:00:00.000Z'),
            pointsUsed: 25
        })
        expect(periods).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Active,
                    periodStart: new Date('2030-07-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-08-10T00:00:00.000Z'),
                    pointsUsed: 25
                }),
                expect.objectContaining({
                    status: MembershipPeriodStatusEnum.Scheduled,
                    periodStart: new Date('2030-08-10T00:00:00.000Z'),
                    periodEnd: new Date('2030-09-10T00:00:00.000Z')
                })
            ])
        )
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                membershipId: membership.id,
                source: MembershipLedgerSourceEnum.StatusChange,
                reason: 'Membership resumed by renewal'
            })
        )
    })
})
