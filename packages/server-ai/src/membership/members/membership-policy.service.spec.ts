jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))
import { MembershipPlanStatusEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createMembershipFeatureRepository, createMembershipService } from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'

describe('MembershipService: policy', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('treats missing membership plan feature toggles as disabled', async () => {
        const featureOrganizationRepository = createMembershipFeatureRepository(() => []).repository
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

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: null
            })
        ).resolves.toBe(false)
    })

    it('keeps explicit tenant scope when the current request belongs to an organization', async () => {
        const requestedScopes: Array<string | null> = []
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) => {
            requestedScopes.push(organizationId)
            return organizationId === 'org-1' ? [{ isEnabled: false }] : [{ isEnabled: true }]
        }).repository
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
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

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: null
            })
        ).resolves.toBe(true)
        expect(requestedScopes).toEqual([null])
    })

    it('uses organization membership plan feature toggles before tenant toggles', async () => {
        const requestedScopes: Array<string | null> = []
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) => {
            requestedScopes.push(organizationId)
            return organizationId === 'org-1' ? [{ isEnabled: false }] : [{ isEnabled: true }]
        }).repository
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

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).resolves.toBe(false)
        expect(requestedScopes).toEqual(['org-1'])
    })

    it('falls back to the tenant membership plan feature toggle when organization toggle is missing', async () => {
        const requestedScopes: Array<string | null> = []
        const featureOrganizationRepository = createMembershipFeatureRepository((organizationId) => {
            requestedScopes.push(organizationId)
            return organizationId === 'org-1' ? [] : [{ isEnabled: true }]
        }).repository
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

        await expect(
            service.isMembershipPlanEnabled({
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        ).resolves.toBe(true)
        expect(requestedScopes).toEqual(['org-1', null])
    })

    it('treats any active organization plan as configured, including catalog-derived plans', async () => {
        const planRepository = {
            count: jest.fn().mockResolvedValue(1)
        }
        const service = createMembershipService(
            {} as never,
            planRepository as never,
            {} as never,
            {} as never,
            {} as never
        )

        await expect(service.hasActiveMembershipPlan({ tenantId: 'tenant-1', organizationId: 'org-1' })).resolves.toBe(
            true
        )
        expect(planRepository.count).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                status: MembershipPlanStatusEnum.Active
            }
        })
    })
})
