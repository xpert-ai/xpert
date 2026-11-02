import {
    AIPermissionsEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { MembershipPlan } from '../membership-plan.entity'
import {
    createMembership,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: backfill', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('creates one default tenant plan before backfilling an empty tenant scope', async () => {
        const { plans, service, userRepository } = createScopeInitializationHarness()
        userRepository.find.mockResolvedValue([])

        const [firstResult, secondResult] = await Promise.all([
            service.backfillTenantDefaultMembershipBatch({
                tenantId: 'tenant-1'
            }),
            service.backfillTenantDefaultMembershipBatch({
                tenantId: 'tenant-1'
            })
        ])

        expect(plans).toEqual([
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: null,
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                period: MembershipPeriodEnum.Monthly,
                includedPoints: 1000,
                allowedModels: [],
                modelMultipliers: [],
                rateLimits: []
            })
        ])
        expect(firstResult).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
        expect(secondResult).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
    })

    it('queues inherited organizations in bounded batches after tenant membership Feature activation', async () => {
        const { backfillQueueService, organizationRepository, service } = createScopeInitializationHarness()

        const result = await service.backfillTenantOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            actorUserId: 'admin-1',
            take: 1
        })

        expect(organizationRepository.find).toHaveBeenCalledWith({
            select: ['id'],
            where: {
                tenantId: 'tenant-1',
                isActive: true
            },
            order: { id: 'ASC' },
            take: 2
        })
        expect(backfillQueueService.enqueueOrganizationDefaultMembershipBackfill).toHaveBeenCalledWith(
            'tenant-1',
            'org-1',
            'admin-1'
        )
        expect(result).toEqual({ scanned: 1, enqueued: 1, nextCursor: 'org-1' })
    })

    it('creates one default organization plan and backfills active members idempotently', async () => {
        const { ledgers, memberships, plans, service } = createScopeInitializationHarness()

        const [firstResult, secondResult] = await Promise.all([
            service.backfillOrganizationDefaultMembershipBatch({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            }),
            service.backfillOrganizationDefaultMembershipBatch({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorUserId: 'admin-1'
            })
        ])

        expect(plans).toEqual([
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                period: MembershipPeriodEnum.Monthly,
                includedPoints: 1000,
                allowedModels: [],
                modelMultipliers: [],
                rateLimits: []
            })
        ])
        expect(memberships).toHaveLength(2)
        expect(memberships).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    organizationId: 'org-1',
                    userId: 'user-1',
                    planId: 'plan-default',
                    source: MembershipSourceEnum.Organization
                }),
                expect.objectContaining({
                    organizationId: 'org-1',
                    userId: 'user-2',
                    planId: 'plan-default',
                    source: MembershipSourceEnum.Organization
                })
            ])
        )
        expect(ledgers).toHaveLength(2)
        expect(firstResult).toEqual({ scanned: 2, assigned: 2, nextCursor: null })
        expect(secondResult).toEqual({ scanned: 2, assigned: 0, nextCursor: null })
    })

    it('creates the organization default plan but skips members without membership use permission', async () => {
        const { ledgers, memberships, plans, service, userRepository } = createScopeInitializationHarness()
        userRepository.find.mockResolvedValue([
            {
                id: 'user-1',
                type: UserType.USER,
                role: {
                    rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true }]
                }
            },
            {
                id: 'user-2',
                type: UserType.USER,
                role: { rolePermissions: [] }
            }
        ])

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(plans).toEqual([
            expect.objectContaining({
                organizationId: 'org-1',
                code: 'default',
                status: MembershipPlanStatusEnum.Active
            })
        ])
        expect(memberships).toEqual([
            expect.objectContaining({
                organizationId: 'org-1',
                userId: 'user-1',
                source: MembershipSourceEnum.Organization
            })
        ])
        expect(ledgers).toHaveLength(1)
        expect(result).toEqual({ scanned: 2, assigned: 1, nextCursor: null })
    })

    it('does not create an organization default plan when the triggering actor cannot edit membership plans', async () => {
        const { ledgers, memberships, plans, service, userRepository } = createScopeInitializationHarness()
        userRepository.findOne.mockImplementation(async ({ where }) => ({
            id: where.id,
            tenantId: where.tenantId,
            type: UserType.USER,
            role: {
                rolePermissions: [{ permission: AIPermissionsEnum.MEMBERSHIP_USE, enabled: true }]
            }
        }))

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'builder-1'
        })

        expect(plans).toHaveLength(0)
        expect(memberships).toHaveLength(0)
        expect(ledgers).toHaveLength(0)
        expect(result).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
    })

    it('does not assign a user who leaves the organization after the batch is scanned', async () => {
        const { memberships, service, userOrganizationRepository } = createScopeInitializationHarness()
        userOrganizationRepository.find
            .mockResolvedValueOnce([
                { id: 'user-organization-1', userId: 'user-1' },
                { id: 'user-organization-2', userId: 'user-2' }
            ])
            .mockResolvedValueOnce([{ id: 'user-organization-1', userId: 'user-1' }])

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(memberships).toEqual([
            expect.objectContaining({
                organizationId: 'org-1',
                userId: 'user-1'
            })
        ])
        expect(result).toEqual({ scanned: 2, assigned: 1, nextCursor: null })
    })

    it('does not replace an existing tenant plan when the scope has no default plan', async () => {
        const { memberships, plans, service } = createScopeInitializationHarness()
        plans.push(
            createPlan({
                id: 'plan-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false
            })
        )

        const result = await service.backfillTenantDefaultMembershipBatch({
            tenantId: 'tenant-1'
        })

        expect(plans).toEqual([
            expect.objectContaining({
                id: 'plan-custom',
                code: 'custom',
                name: 'Custom',
                isDefault: false
            })
        ])
        expect(memberships).toHaveLength(0)
        expect(result).toEqual({ scanned: 0, assigned: 0, nextCursor: null })
    })

    it('backfills one tenant batch without replacing existing memberships or repeating eligibility queries', async () => {
        const { memberships, membershipRepository, plans, service, userRepository } = createScopeInitializationHarness()
        plans.push(createPlan({ id: 'plan-tenant-default' }))
        memberships.push(
            createMembership({
                id: 'membership-manual',
                organizationId: null,
                userId: 'user-1',
                planId: 'plan-manual',
                source: MembershipSourceEnum.Admin
            })
        )
        userRepository.find.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }])

        const result = await service.backfillTenantDefaultMembershipBatch({
            tenantId: 'tenant-1',
            take: 2
        })

        expect(memberships).toHaveLength(2)
        expect(memberships).toContainEqual(
            expect.objectContaining({
                id: 'membership-manual',
                userId: 'user-1',
                planId: 'plan-manual',
                source: MembershipSourceEnum.Admin
            })
        )
        expect(memberships).toContainEqual(
            expect.objectContaining({
                userId: 'user-2',
                planId: 'plan-tenant-default',
                source: MembershipSourceEnum.TenantDefault
            })
        )
        expect(membershipRepository.save).toHaveBeenCalledTimes(1)
        expect(userRepository.findOne).not.toHaveBeenCalled()
        expect(result).toEqual({
            scanned: 2,
            assigned: 1,
            nextCursor: 'user-2'
        })
    })

    it('reactivates an archived Default organization plan and backfills active members idempotently', async () => {
        const { memberships, planRepository, plans, service } = createScopeInitializationHarness()
        const archivedPlan = {
            id: 'plan-archived',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'default',
            name: 'Default',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 1000,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan
        plans.push(archivedPlan)
        memberships.push(
            createMembership({
                id: 'membership-expired',
                organizationId: 'org-1',
                userId: 'user-1',
                status: MembershipStatusEnum.Expired,
                planId: archivedPlan.id,
                plan: archivedPlan
            })
        )

        const firstResult = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })
        const secondResult = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(plans).toEqual([
            expect.objectContaining({
                id: 'plan-archived',
                code: 'default',
                name: 'Default',
                status: MembershipPlanStatusEnum.Active,
                isDefault: true
            })
        ])
        expect(memberships).toHaveLength(3)
        expect(memberships).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'membership-expired',
                    userId: 'user-1',
                    status: MembershipStatusEnum.Expired
                }),
                expect.objectContaining({
                    userId: 'user-1',
                    status: MembershipStatusEnum.Active,
                    planId: 'plan-archived'
                }),
                expect.objectContaining({
                    userId: 'user-2',
                    status: MembershipStatusEnum.Active,
                    planId: 'plan-archived'
                })
            ])
        )
        expect(planRepository.save).toHaveBeenCalledTimes(1)
        expect(firstResult).toEqual({ scanned: 2, assigned: 2, nextCursor: null })
        expect(secondResult).toEqual({ scanned: 2, assigned: 0, nextCursor: null })
    })

    it('keeps archived organization plans and creates one active Default plan for backfill', async () => {
        const { memberships, plans, service } = createScopeInitializationHarness()
        plans.push({
            id: 'plan-archived',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            code: 'legacy',
            name: 'Legacy',
            status: MembershipPlanStatusEnum.Archived,
            isDefault: false,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: 500,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        } as MembershipPlan)

        const result = await service.backfillOrganizationDefaultMembershipBatch({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorUserId: 'admin-1'
        })

        expect(plans).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'plan-archived',
                    code: 'legacy',
                    status: MembershipPlanStatusEnum.Archived,
                    isDefault: false
                }),
                expect.objectContaining({
                    code: 'default',
                    name: 'Default',
                    status: MembershipPlanStatusEnum.Active,
                    isDefault: true
                })
            ])
        )
        expect(plans).toHaveLength(2)
        expect(memberships).toHaveLength(2)
        expect(result).toEqual({ scanned: 2, assigned: 2, nextCursor: null })
    })
})
