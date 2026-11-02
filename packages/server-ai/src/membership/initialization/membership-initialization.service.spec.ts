import {
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { MembershipPlan } from '../membership-plan.entity'
import {
    createMembership,
    createMembershipFeatureRepository,
    createMembershipService,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: initialization', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('does not auto-assign organization users when membership plan feature is disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )
        const ensureScopeInitialized = jest.spyOn(
            getMembershipFixture(service).initialization,
            'ensureScopeInitialized'
        )

        await expect(
            service.ensureUserAssignedIfScopeInitialized({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user'
            })
        ).resolves.toBeNull()
        expect(ensureScopeInitialized).not.toHaveBeenCalled()
    })

    it('assigns an initialized organization Default to a user with use permission but no edit permission', async () => {
        const { memberships, plans, service } = createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-org-default',
                organizationId: 'org-1'
            })
        )

        const membership = await service.ensureUserAssignedIfScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1'
        })

        expect(membership).toMatchObject({
            organizationId: 'org-1',
            userId: 'user-1',
            planId: 'plan-org-default'
        })
        expect(memberships).toHaveLength(1)
    })

    it('grants the tenant default membership idempotently without treating an organization membership as tenant-level', async () => {
        const { dataSource, ledgers, ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-org-default',
                organizationId: 'org-1',
                code: 'org-default',
                name: 'Organization Default',
                includedPoints: 500
            }),
            createPlan({ id: 'plan-tenant-default' })
        )
        memberships.push(
            createMembership({
                id: 'membership-org',
                organizationId: 'org-1',
                userId: 'trial-user'
            })
        )

        const firstMembership = await service.ensureTenantDefaultMembership({
            tenantId: 'tenant-1',
            userId: 'trial-user'
        })
        const secondMembership = await service.ensureTenantDefaultMembership({
            tenantId: 'tenant-1',
            userId: 'trial-user'
        })

        expect(firstMembership).toMatchObject({
            organizationId: null,
            userId: 'trial-user',
            planId: 'plan-tenant-default',
            pointsGranted: 1000,
            pointsUsed: 0,
            pointsTotalUsed: 0,
            note: 'Default tenant plan grant'
        })
        expect(secondMembership?.id).toBe(firstMembership?.id)
        expect(memberships.filter((membership) => membership.organizationId == null)).toHaveLength(1)
        expect(dataSource.transaction).toHaveBeenCalledTimes(2)
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgers).toHaveLength(1)
        expect(ledgers[0]).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'trial-user',
            planId: 'plan-tenant-default',
            source: MembershipLedgerSourceEnum.Grant,
            pointsDelta: 1000,
            reason: 'Default tenant plan grant'
        })
    })

    it('does not grant the tenant default membership without membership use permission', async () => {
        const { ledgers, memberships, plans, service, userRepository } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        userRepository.findOne.mockImplementation(async ({ where }) => ({
            id: where.id,
            tenantId: where.tenantId,
            type: UserType.USER,
            role: { rolePermissions: [] }
        }))

        await expect(
            service.ensureTenantDefaultMembership({
                tenantId: 'tenant-1',
                userId: 'trial-user'
            })
        ).resolves.toBeNull()

        expect(plans).toHaveLength(1)
        expect(memberships).toHaveLength(0)
        expect(ledgers).toHaveLength(0)
    })

    it('serializes concurrent tenant default membership grants for the same user', async () => {
        const { ledgerRepository, ledgers, memberships, membershipRepository, plans, service, transactionManagers } =
            createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))

        const [firstMembership, secondMembership] = await Promise.all([
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'trial-user' }),
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'trial-user' })
        ])

        expect(firstMembership?.id).toBe(secondMembership?.id)
        expect(memberships.filter((membership) => membership.organizationId == null)).toHaveLength(1)
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgers).toHaveLength(1)
        expect(transactionManagers).toHaveLength(2)
        transactionManagers.forEach((transactionManager, index) => {
            expect(transactionManager.query).toHaveBeenCalledWith(
                'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                ['tenant-1', 'tenant-default-membership:trial-user']
            )
            expect(transactionManager.query.mock.invocationCallOrder[0]).toBeLessThan(
                membershipRepository.createQueryBuilder.mock.invocationCallOrder[index]
            )
        })
    })

    it('preserves an existing active tenant membership instead of replacing its plan', async () => {
        const { ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        const existingMembership = createMembership({
            id: 'membership-custom',
            organizationId: null,
            userId: 'trial-user',
            planId: 'plan-custom',
            pointsGranted: 250,
            plan: createPlan({
                id: 'plan-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false,
                includedPoints: 250
            })
        })
        memberships.push(existingMembership)

        const result = await service.ensureTenantDefaultMembership({
            tenantId: 'tenant-1',
            userId: 'trial-user'
        })

        expect(result).toBe(existingMembership)
        expect(result).toMatchObject({ planId: 'plan-custom', pointsGranted: 250 })
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('does not regrant a tenant default membership after it was revoked', async () => {
        const { ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        memberships.push(
            createMembership({
                id: 'membership-revoked',
                organizationId: null,
                userId: 'trial-user',
                status: MembershipStatusEnum.Expired
            })
        )

        await expect(
            service.ensureTenantDefaultMembership({ tenantId: 'tenant-1', userId: 'trial-user' })
        ).resolves.toBeNull()
        expect(memberships).toHaveLength(1)
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('does not create a membership when the tenant has no active default plan', async () => {
        const { ledgerRepository, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-org-default',
                organizationId: 'org-1',
                code: 'org-default',
                name: 'Organization Default',
                includedPoints: 500
            }),
            createPlan({
                id: 'plan-tenant-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false,
                includedPoints: 250
            })
        )

        await expect(
            service.ensureTenantDefaultMembership({
                tenantId: 'tenant-1',
                userId: 'trial-user'
            })
        ).resolves.toBeNull()
        expect(planRepository.save).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
    })

    it('queues organization initialization when no active organization plan exists', async () => {
        const {
            backfillQueueService,
            dataSource,
            ledgerRepository,
            memberships,
            membershipRepository,
            planRepository,
            plans,
            service
        } = createScopeInitializationHarness()

        const status = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(status).toMatchObject({
            scope: 'organization',
            initialized: true,
            activeMemberCount: 2,
            assignedMemberCount: 0,
            activePlanCount: 0,
            defaultPlan: null
        })
        expect(plans).toHaveLength(0)
        expect(memberships).toHaveLength(0)
        expect(dataSource.transaction).not.toHaveBeenCalled()
        expect(planRepository.save).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
    })

    it('does not queue organization initialization for an actor without membership edit permission', async () => {
        const { backfillQueueService, service } = createScopeInitializationHarness()

        await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'builder-1'
        })

        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('queues new organization initialization only when effective Feature and actor permission are both enabled', async () => {
        const { backfillQueueService, service } = createScopeInitializationHarness()

        await expect(
            service.enqueueOrganizationDefaultMembershipInitialization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            })
        ).resolves.toBe(true)
        await expect(
            service.enqueueOrganizationDefaultMembershipInitialization({
                tenantId: 'tenant-1',
                organizationId: 'org-2',
                actorUserId: 'builder-1'
            })
        ).resolves.toBe(false)

        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledTimes(1)
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
    })

    it('does not queue new organization initialization when the effective Feature is disabled', async () => {
        const { backfillQueueService, service } = createScopeInitializationHarness(undefined, () => [
            { isEnabled: false }
        ])

        await expect(
            service.enqueueOrganizationDefaultMembershipInitialization({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            })
        ).resolves.toBe(false)

        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('initializes tenant scope by enqueueing an idempotent backfill', async () => {
        const { backfillQueueService, memberships, plans, service } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))

        const firstStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: null,
            assignedById: 'admin-1'
        })
        const secondStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: null,
            assignedById: 'admin-1'
        })

        expect(firstStatus).toMatchObject({
            scope: 'tenant',
            initialized: true,
            activePlanCount: 1
        })
        expect(secondStatus).toMatchObject({
            scope: 'tenant',
            initialized: true,
            activePlanCount: 1
        })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledTimes(2)
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenNthCalledWith(1, 'tenant-1')
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenNthCalledWith(2, 'tenant-1')
        expect(memberships).toHaveLength(0)
    })

    it('queues organization initialization when only archived organization plans exist', async () => {
        const {
            backfillQueueService,
            dataSource,
            ledgerRepository,
            memberships,
            membershipRepository,
            planRepository,
            plans,
            service
        } = createScopeInitializationHarness()
        plans.push({
            id: 'plan-archived',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'default-unlimited',
            name: 'Default Unlimited',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: null,
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan)

        const status = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(status).toMatchObject({
            scope: 'organization',
            initialized: true,
            activePlanCount: 0,
            defaultPlan: null
        })
        expect(plans).toHaveLength(1)
        expect(plans[0]).toMatchObject({
            code: 'default-unlimited',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false
        })
        expect(memberships).toHaveLength(0)
        expect(dataSource.transaction).not.toHaveBeenCalled()
        expect(planRepository.save).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(ledgerRepository.save).not.toHaveBeenCalled()
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
    })

    it('does not count or promote a catalog clone as the organization default plan', async () => {
        const { backfillQueueService, plans, service } = createScopeInitializationHarness()
        const catalogClone = createPlan({
            id: 'catalog-clone',
            organizationId: 'org-1',
            code: 'catalog-paid',
            isDefault: false,
            catalogSourcePlanId: 'catalog-plan'
        })
        plans.push(catalogClone)

        const beforeBackfill = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })
        await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })
        const afterBackfill = await service.getScopeStatus({
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })

        expect(beforeBackfill).toMatchObject({
            planCount: 0,
            activePlanCount: 0,
            defaultPlan: null
        })
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
        expect(catalogClone.isDefault).toBe(false)
        expect(plans).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'plan-default',
                    organizationId: 'org-1',
                    code: 'default',
                    isDefault: true
                })
            ])
        )
        expect(afterBackfill).toMatchObject({
            planCount: 1,
            activePlanCount: 1,
            defaultPlan: expect.objectContaining({ id: 'plan-default' })
        })
    })

    it('initializes organization scope with an existing active plan and active member memberships idempotently', async () => {
        const { ledgerRepository, memberships, membershipRepository, planRepository, plans, service } =
            createScopeInitializationHarness()
        plans.push({
            id: 'plan-custom',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'custom',
            name: 'Custom',
            status: MembershipPlanStatusEnum.Active,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 500,
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan)

        const firstStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })
        const secondStatus = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(firstStatus).toMatchObject({
            scope: 'organization',
            initialized: true,
            activeMemberCount: 2,
            assignedMemberCount: 2,
            activePlanCount: 1
        })
        expect(secondStatus).toMatchObject({
            initialized: true,
            activeMemberCount: 2,
            assignedMemberCount: 2
        })
        expect(plans).toHaveLength(1)
        expect(plans[0]).toMatchObject({
            code: 'custom',
            name: 'Custom',
            includedPoints: 500,
            isDefault: true,
            status: MembershipPlanStatusEnum.Active
        })
        expect(memberships).toHaveLength(2)
        expect(membershipRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(2)
        expect(ledgerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsDelta: 500 }))
        expect(planRepository.save).toHaveBeenCalledTimes(1)
    })

    it('preserves paused and revoked records while filling missing active organization memberships', async () => {
        const { ledgerRepository, memberships, membershipRepository, plans, service } =
            createScopeInitializationHarness()
        const plan = createPlan({
            id: 'plan-org-default',
            organizationId: 'org-1',
            isDefault: true
        })
        plans.push(plan)
        memberships.push(
            createMembership({
                id: 'membership-paused',
                organizationId: 'org-1',
                userId: 'user-1',
                status: MembershipStatusEnum.Paused,
                planId: plan.id,
                plan
            }),
            createMembership({
                id: 'membership-revoked',
                organizationId: 'org-1',
                userId: 'user-2',
                status: MembershipStatusEnum.Expired,
                planId: plan.id,
                plan
            })
        )

        const status = await service.ensureScopeInitialized({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            assignedById: 'admin-1'
        })

        expect(status).toMatchObject({ initialized: true, needsRepair: false, assignedMemberCount: 2 })
        expect(memberships.map((membership) => membership.status)).toEqual([
            MembershipStatusEnum.Paused,
            MembershipStatusEnum.Expired,
            MembershipStatusEnum.Active
        ])
        expect(memberships[2]).toMatchObject({
            userId: 'user-2',
            planId: plan.id,
            source: MembershipSourceEnum.Organization
        })
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(ledgerRepository.save).toHaveBeenCalledTimes(1)
    })
})
