import {
    MembershipPeriodStatusEnum,
    MembershipRenewalModeEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import {
    createMembership,
    createMembershipFeatureRepository,
    createMembershipService,
    createPlan,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { XpertBillingPayer } from '../membership.service'
import { getMembershipFixture } from '../testing/membership.test-fixture'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: access', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('returns no model access without resolving billable xpert users when membership plan feature is disabled', async () => {
        const xpertRepository = {
            findOne: jest.fn()
        }
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1'
            })
        ).resolves.toBeNull()
        expect(xpertRepository.findOne).not.toHaveBeenCalled()
    })

    it('uses organization membership before tenant membership for model access', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const organizationMembership = createMembership({ organizationId: 'org-1' })
        const findUsableMembership = jest
            .spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership')
            .mockResolvedValue(organizationMembership)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            membership: organizationMembership
        })
        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'assistant-tech-user', undefined, false)
    })

    it('does not expose membership model access without membership use permission', async () => {
        const userRepository = {
            findOne: jest.fn(async ({ where }) => ({
                id: where.id,
                tenantId: where.tenantId,
                type: UserType.USER,
                role: { rolePermissions: [] }
            }))
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            userRepository as never
        )
        const findUsableMembership = jest
            .spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership')
            .mockResolvedValue(createMembership({ organizationId: 'org-1' }))

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user'
            })
        ).resolves.toBeNull()
        expect(findUsableMembership).not.toHaveBeenCalled()
    })

    it('falls back to tenant membership for model access when organization membership is missing', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const tenantMembership = createMembership({ organizationId: null })
        const findUsableMembership = jest
            .spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(tenantMembership)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            membership: tenantMembership
        })
        expect(findUsableMembership).toHaveBeenNthCalledWith(
            1,
            'tenant-1',
            'org-1',
            'assistant-tech-user',
            undefined,
            false
        )
        expect(findUsableMembership).toHaveBeenNthCalledWith(
            2,
            'tenant-1',
            null,
            'assistant-tech-user',
            undefined,
            false
        )
    })

    it('does not use assigned tenant membership when the tenant membership feature is disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) =>
            organizationId === 'org-1' ? [{ isEnabled: true }] : [{ isEnabled: false }]
        ).repository
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
        const findUsableMembership = jest
            .spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership')
            .mockResolvedValueOnce(null)
        jest.spyOn(getMembershipFixture(service).records, 'hasActivePlan').mockResolvedValue(false)

        await expect(
            service.findModelAccess({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1'
            })
        ).resolves.toBeNull()

        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'user-1', undefined, false)
    })

    it('does not fall back to tenant membership when organization has an active plan', async () => {
        const service = createMembershipService({} as never, {} as never, {} as never, {} as never, {} as never)
        const findUsableMembership = jest
            .spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership')
            .mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).records, 'hasActivePlan').mockResolvedValue(true)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user'
        })

        expect(access).toBeNull()
        expect(findUsableMembership).toHaveBeenCalledTimes(1)
        expect(findUsableMembership).toHaveBeenCalledWith('tenant-1', 'org-1', 'assistant-tech-user', undefined, false)
    })

    it('uses the runtime user when authenticated Xpert access selects that payer', async () => {
        const xpertRepository = {
            findOne: jest.fn()
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )

        await expect(
            service.resolveBillableUserId({
                tenantId: 'tenant-1',
                userId: 'shared-user',
                xpertId: 'xpert-1',
                xpertBillingPayer: XpertBillingPayer.RuntimeUser
            })
        ).resolves.toBe('shared-user')
        expect(xpertRepository.findOne).not.toHaveBeenCalled()
    })

    it('rejects usage when the referenced xpert no longer exists', async () => {
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue(null)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            xpertRepository as never
        )

        await expect(
            service.resolveBillableUserId({
                tenantId: 'tenant-1',
                userId: 'assistant-tech-user',
                xpertId: 'missing-xpert'
            })
        ).rejects.toThrow('The Xpert creator is required')
    })

    it('repairs a stale finite allowance when the assigned plan is unlimited', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const service = createMembershipService(
            {} as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership({
            currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
            pointsGranted: 0,
            plan: {
                ...createMembership().plan,
                includedPoints: null
            }
        })

        jest.spyOn(getMembershipFixture(service).records, 'findActiveMembership').mockResolvedValue(membership)
        jest.spyOn(getMembershipFixture(service).records, 'createLedger').mockResolvedValue(new MembershipPointLedger())

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: membership.userId
        })

        expect(access?.membership.pointsGranted).toBeNull()
        expect(membershipRepository.save).toHaveBeenCalledWith(expect.objectContaining({ pointsGranted: null }))
    })

    it('uses personal points with the default plan after a manual membership expires', async () => {
        const membershipRepository = {
            save: jest.fn().mockImplementation(async (membership) => membership)
        }
        const defaultPlan = createPlan({
            id: 'plan-free',
            code: 'free',
            name: 'Free',
            includedPoints: 100
        })
        const planRepository = {
            findOne: jest.fn().mockResolvedValue(defaultPlan)
        }
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )
        const membership = createMembership({
            renewalMode: MembershipRenewalModeEnum.Manual,
            currentPeriodEnd: new Date('2020-01-01T00:00:00.000Z')
        })
        jest.spyOn(getMembershipFixture(service).records, 'findActiveMembership').mockResolvedValue(membership)
        jest.spyOn(getMembershipFixture(service).records, 'findMembershipForUpdate').mockResolvedValue(membership)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(10)
        const renewMembership = jest.spyOn(getMembershipFixture(service).lifecycle, 'renewMembership')
        jest.spyOn(getMembershipFixture(service).records, 'createMembershipStatusLedger').mockResolvedValue(undefined)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: membership.userId
        })

        expect(access).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: null,
            personalPointsOnly: true,
            persistedMembership: membership,
            membership: {
                planId: 'plan-free',
                plan: defaultPlan,
                pointsGranted: 0,
                pointsUsed: 0
            }
        })
        expect(membership.status).toBe(MembershipStatusEnum.Expired)
        expect(membership.planId).toBe('plan-1')
        expect(membership.pointsGranted).toBe(100)
        expect(membershipRepository.save).toHaveBeenCalledWith(membership)
        expect(renewMembership).not.toHaveBeenCalled()
    })

    it('uses personal points with the default plan even without membership history', async () => {
        const defaultPlan = createPlan({ id: 'plan-free', code: 'free', name: 'Free' })
        const membershipRepository = {
            create: jest.fn((input) => ({ ...input }))
        }
        const service = createMembershipService(
            {} as never,
            { findOne: jest.fn().mockResolvedValue(defaultPlan) } as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )

        jest.spyOn(getMembershipFixture(service).records, 'findActiveMembership').mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).records, 'findMembershipForUpdate').mockResolvedValue(null)
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(10)

        const access = await service.findModelAccess({
            tenantId: 'tenant-1',
            organizationId: null,
            userId: 'owner-user'
        })

        expect(access).toMatchObject({
            personalPointsOnly: true,
            membership: {
                userId: 'owner-user',
                planId: 'plan-free',
                pointsGranted: 0,
                pointsUsed: 0
            }
        })
        expect(access?.persistedMembership).toBeUndefined()
    })

    it('activates the queued snapshot at the period boundary', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-15T00:00:00.000Z'))
        try {
            const { memberships, periods, plans, service } = createScopeInitializationHarness()
            const plan = createPlan({ id: 'plan-snapshot', name: 'Snapshot plan', includedPoints: 2000 })
            plans.push(plan)
            memberships.push(
                createMembership({
                    id: 'membership-current',
                    userId: 'user-1',
                    planId: plan.id,
                    plan,
                    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
                    currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
                    pointsGranted: 2000,
                    pointsUsed: 500
                })
            )

            await service.appendMembershipPeriods({
                tenantId: 'tenant-1',
                userId: 'user-1',
                planId: plan.id,
                count: 1,
                sourceReference: 'order-boundary'
            })
            plan.name = 'Plan changed later'
            plan.includedPoints = 9000

            jest.setSystemTime(new Date('2026-08-15T00:00:00.000Z'))
            const access = await service.findModelAccess({
                tenantId: 'tenant-1',
                userId: 'user-1'
            })

            expect(access?.membership.currentPeriodStart).toEqual(new Date('2026-08-01T00:00:00.000Z'))
            expect(access?.membership.currentPeriodEnd).toEqual(new Date('2026-09-01T00:00:00.000Z'))
            expect(access?.membership.pointsGranted).toBe(2000)
            expect(access?.membership.pointsUsed).toBe(0)
            expect(access?.membership.plan.name).toBe('Snapshot plan')
            expect(periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Active)).toHaveLength(1)
            expect(periods.filter(({ status }) => status === MembershipPeriodStatusEnum.Completed)).toHaveLength(1)
        } finally {
            jest.useRealTimers()
        }
    })
})
