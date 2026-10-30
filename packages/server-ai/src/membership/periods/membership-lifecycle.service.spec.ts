jest.mock('../../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))
import * as membershipLocks from '../membership-locks'
import { createMembership, createMembershipService } from '../testing/membership-service.test-fixture'
import * as usagePoints from '../membership-usage-points'
import { getMembershipFixture } from '../testing/membership.test-fixture'

describe('MembershipService: lifecycle', () => {
    beforeEach(() => {
        jest.spyOn(usagePoints, 'readPeriodConsumedPoints').mockResolvedValue(0)
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })
    it('settles due active memberships in a transaction', async () => {
        const candidate = createMembership({
            currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z')
        })
        const queryBuilder = {
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([candidate])
        }
        const membershipRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const manager = {}
        const dataSource = {
            transaction: jest.fn((run: (transactionManager: object) => Promise<unknown>) => run(manager))
        }
        const service = createMembershipService(
            dataSource as never,
            {} as never,
            membershipRepository as never,
            {} as never,
            {} as never
        )

        jest.spyOn(getMembershipFixture(service).policy, 'isMembershipPlanEnabledForScope').mockResolvedValue(true)
        jest.spyOn(membershipLocks, 'acquireMembershipAssignmentLock').mockResolvedValue(undefined)
        jest.spyOn(getMembershipFixture(service).records, 'findMembershipForUpdate').mockResolvedValue(candidate)
        jest.spyOn(getMembershipFixture(service).lifecycle, 'findUsableMembership').mockResolvedValue(candidate)

        const result = await service.processDueMembershipPeriods()

        expect(result).toEqual({ scanned: 1, settled: 1, skipped: 0, failed: 0 })
        expect(getMembershipFixture(service).lifecycle.findUsableMembership).toHaveBeenCalledWith(
            candidate.tenantId,
            null,
            candidate.userId,
            manager,
            true
        )
    })
})
