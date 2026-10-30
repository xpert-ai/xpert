import { MembershipPlanStatusEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    createMembership,
    createMembershipFeatureRepository,
    createMembershipService,
    createScopeInitializationHarness
} from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: plans', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('deletes only archived plans that are not assigned to users', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, plans, service } = createScopeInitializationHarness()

        const archivedPlan = await service.createPlan({
            code: 'archived',
            name: 'Archived',
            status: MembershipPlanStatusEnum.Archived
        })
        await service.deletePlan(archivedPlan.id)
        expect(plans).toHaveLength(0)

        const activePlan = await service.createPlan({ code: 'active', name: 'Active' })
        await expect(service.deletePlan(activePlan.id)).rejects.toThrow(
            'Archive the membership plan before deleting it.'
        )

        await service.archivePlan(activePlan.id)
        memberships.push(createMembership({ planId: activePlan.id }))
        await expect(service.deletePlan(activePlan.id)).rejects.toThrow(
            'This membership plan is still assigned to users and cannot be deleted.'
        )
        expect(plans).toHaveLength(1)
    })

    it('does not archive plans that are still assigned to users', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, plans, service } = createScopeInitializationHarness()
        const activePlan = await service.createPlan({ code: 'assigned', name: 'Assigned' })
        memberships.push(createMembership({ planId: activePlan.id }))

        await expect(service.archivePlan(activePlan.id)).rejects.toThrow(
            'This membership plan is still assigned to users and cannot be archived.'
        )
        await expect(service.updatePlan(activePlan.id, { status: MembershipPlanStatusEnum.Archived })).rejects.toThrow(
            'This membership plan is still assigned to users and cannot be archived.'
        )
        expect(plans[0].status).toBe(MembershipPlanStatusEnum.Active)
    })

    it('synchronizes active assigned memberships when a plan allowance changes', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { memberships, service } = createScopeInitializationHarness()
        const plan = await service.createPlan({ code: 'assigned', name: 'Assigned', includedPoints: 1000 })
        memberships.push(createMembership({ planId: plan.id, pointsGranted: 1000, pointsUsed: 100 }))

        await service.updatePlan(plan.id, { includedPoints: null })

        expect(memberships[0].pointsGranted).toBeNull()
    })

    it('does not synchronize assigned memberships when the plan allowance is unchanged', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { ledgers, memberships, service } = createScopeInitializationHarness()
        const plan = await service.createPlan({ code: 'assigned', name: 'Assigned', includedPoints: 1000 })
        memberships.push(createMembership({ planId: plan.id, pointsGranted: 1000, pointsUsed: 100 }))

        await service.updatePlan(plan.id, { description: 'Updated description', includedPoints: 1000 })

        expect(memberships[0].pointsGranted).toBe(1000)
        expect(ledgers).not.toContainEqual(expect.objectContaining({ reason: 'Membership plan allowance updated' }))
    })

    it('does not allow an archived plan to remain the default plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { plans, service } = createScopeInitializationHarness()

        await expect(
            service.createPlan({
                code: 'archived-default',
                name: 'Archived default',
                status: MembershipPlanStatusEnum.Archived,
                isDefault: true
            })
        ).rejects.toThrow('An archived membership plan cannot be the default plan.')

        const activePlan = await service.createPlan({ code: 'default', name: 'Default', isDefault: true })
        await expect(service.updatePlan(activePlan.id, { status: MembershipPlanStatusEnum.Archived })).rejects.toThrow(
            'An archived membership plan cannot be the default plan.'
        )
        expect(plans[0]).toMatchObject({ status: MembershipPlanStatusEnum.Active, isDefault: true })
    })

    it('enqueues a tenant backfill after creating a default plan', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { backfillQueueService, memberships, service } = createScopeInitializationHarness()

        await service.createPlan({
            code: 'default',
            name: 'Default',
            isDefault: true
        })

        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')
        expect(memberships).toHaveLength(0)
    })

    it('enqueues a tenant backfill only when a plan becomes the active default', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { backfillQueueService, service } = createScopeInitializationHarness()
        const plan = await service.createPlan({
            code: 'candidate',
            name: 'Candidate'
        })
        backfillQueueService.enqueueTenantDefaultMembershipBackfill.mockClear()

        await service.updatePlan(plan.id, { name: 'Renamed candidate' })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()

        await service.updatePlan(plan.id, { isDefault: true })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).toHaveBeenCalledWith('tenant-1')

        backfillQueueService.enqueueTenantDefaultMembershipBackfill.mockClear()
        await service.updatePlan(plan.id, { name: 'Renamed default' })
        expect(backfillQueueService.enqueueTenantDefaultMembershipBackfill).not.toHaveBeenCalled()
    })

    it('normalizes allowed model rules when saving plans', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { plans, service } = createScopeInitializationHarness()

        await service.createPlan({
            code: 'restricted-models',
            name: 'Restricted models',
            allowedModels: [
                {
                    provider: ' tongyi ',
                    model: ' qwen3.6-plus ',
                    copilotId: ' 112f87f9-409f-40f0-8cf4-52bb9f033258 '
                }
            ]
        })

        expect(plans[0].allowedModels).toEqual([
            {
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                copilotId: '112f87f9-409f-40f0-8cf4-52bb9f033258'
            }
        ])
        await expect(
            service.createPlan({
                code: 'invalid-models',
                name: 'Invalid models',
                allowedModels: [{ provider: '', model: 'qwen3.6-plus' }]
            })
        ).rejects.toThrow('Allowed models must be an array of provider and model pairs.')
    })

    it('lists plans in the current scope without creating a default plan', async () => {
        const planRepository = {
            find: jest.fn().mockResolvedValue([])
        }
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            {} as never,
            {} as never,
            {} as never
        )

        const plans = await service.findPlans()

        expect(plans).toEqual([])
        expect(planRepository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                catalogSourcePlanId: expect.objectContaining({
                    _type: 'isNull'
                })
            },
            order: { isDefault: 'DESC', createdAt: 'ASC' }
        })
    })

    it('rejects membership admin reads when membership plan feature is disabled', async () => {
        const planRepository = {
            find: jest.fn()
        }
        const featureOrganizationRepository = createMembershipFeatureRepository(() => [{ isEnabled: false }]).repository
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            undefined,
            undefined,
            featureOrganizationRepository as never
        )

        await expect(service.findPlans()).rejects.toThrow('Membership plan feature is disabled.')
        expect(planRepository.find).not.toHaveBeenCalled()
    })

    it('rejects invalid settlement amount multiplier and rate-limit plan rules', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { service } = createScopeInitializationHarness()

        await expect(
            service.createPlan({
                code: 'bad-multiplier',
                name: 'Bad multiplier',
                modelMultipliers: [{ model: '*', multiplier: Number.NaN }]
            })
        ).rejects.toThrow('Each settlement amount multiplier must be a non-negative number.')
        await expect(
            service.createPlan({
                code: 'bad-limit',
                name: 'Bad limit',
                rateLimits: [{ model: '*', period: 'day', pointLimit: 0 }]
            })
        ).rejects.toThrow('Each rate limit requires a valid period and a positive point limit.')
    })
})
