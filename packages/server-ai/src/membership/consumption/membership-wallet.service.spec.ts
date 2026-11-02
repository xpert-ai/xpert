import { MembershipLedgerSourceEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createScopeInitializationHarness } from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'
jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

describe('MembershipService: wallet', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('preserves point adjustments with up to three decimal places', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { ledgers, service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

        await expect(service.adjustPersonalPoints('user-1', { pointDelta: 1.234 })).resolves.toEqual({
            userId: 'user-1',
            balance: 1.234
        })
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                userId: 'user-1',
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                pointsDelta: 1.234
            })
        )
    })

    it('rejects point adjustments with more than three decimal places', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { dataSource, service } = createScopeInitializationHarness()

        await expect(service.adjustPersonalPoints('user-1', { pointDelta: 1.2345 })).rejects.toThrow(
            'Point adjustment must be non-zero and use at most three decimal places.'
        )
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('applies a referenced personal-point adjustment idempotently', async () => {
        const { ledgers, service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance')
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(25)

        const input = {
            tenantId: 'tenant-1',
            userId: 'user-1',
            pointDelta: 25,
            sourceReference: 'point-order-1',
            actorId: 'buyer-1',
            reason: 'External point fulfillment'
        }
        const first = await service.applyPersonalPointsAdjustment(input)
        const repeated = await service.applyPersonalPointsAdjustment(input)

        expect(first).toEqual({ userId: 'user-1', balance: 25 })
        expect(repeated).toEqual({ userId: 'user-1', balance: 25 })
        expect(
            ledgers.filter(
                ({ tenantId, sourceReference }) =>
                    tenantId === input.tenantId && sourceReference === input.sourceReference
            )
        ).toHaveLength(1)
        expect(ledgers).toContainEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'user-1',
                membershipId: null,
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                sourceReference: 'point-order-1',
                actorId: 'buyer-1',
                pointsDelta: 25
            })
        )
    })

    it('uses a caller-provided transaction for a referenced personal-point adjustment', async () => {
        const { dataSource, service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

        await dataSource.transaction((manager) =>
            service.applyPersonalPointsAdjustment(
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    pointDelta: 25,
                    sourceReference: 'point-order-transaction'
                },
                manager as never
            )
        )

        expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('rejects a referenced personal-point adjustment replayed with different accounting data', async () => {
        const { service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(0)

        await service.applyPersonalPointsAdjustment({
            tenantId: 'tenant-1',
            userId: 'user-1',
            pointDelta: 25,
            sourceReference: 'point-order-mismatch'
        })

        await expect(
            service.applyPersonalPointsAdjustment({
                tenantId: 'tenant-1',
                userId: 'user-1',
                pointDelta: 30,
                sourceReference: 'point-order-mismatch'
            })
        ).rejects.toThrow('Personal points adjustment does not match the existing fulfillment.')
        await expect(
            service.applyPersonalPointsAdjustment({
                tenantId: 'tenant-1',
                userId: 'user-2',
                pointDelta: 25,
                sourceReference: 'point-order-mismatch'
            })
        ).rejects.toThrow('Personal points adjustment does not match the existing fulfillment.')
    })

    it('rejects a referenced personal-point debit that would make the balance negative', async () => {
        const { service } = createScopeInitializationHarness()
        jest.spyOn(getMembershipFixture(service).records, 'getPersonalPointsBalance').mockResolvedValue(10)

        await expect(
            service.applyPersonalPointsAdjustment({
                tenantId: 'tenant-1',
                userId: 'user-1',
                pointDelta: -11,
                sourceReference: 'point-refund-too-large'
            })
        ).rejects.toThrow('Personal points balance cannot be negative.')
    })
})
