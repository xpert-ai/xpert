import { MembershipPeriodStatusEnum, MembershipStatusEnum } from '@xpert-ai/contracts'
import { IsNull, LessThanOrEqual, MoreThan } from 'typeorm'
import { MembershipPeriod } from './membership-period.entity'
import { UserMembership } from './user-membership.entity'
import { createMembershipPlanSnapshot } from './membership-plan-snapshot'
import { MembershipPlan } from './membership-plan.entity'
import { membershipStorageBytes, normalizeIncludedStorageBytes } from './membership-storage'

const now = new Date('2030-07-15T00:00:00Z')
const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
const snapshot = (bytes?: number) =>
    createMembershipPlanSnapshot(Object.assign(new MembershipPlan(), { includedStorageBytes: bytes }))
function fixture() {
    const membership = Object.assign(new UserMembership(), {
        id: 'membership',
        ...scope,
        status: MembershipStatusEnum.Active,
        currentPeriodStart: new Date('2030-07-01'),
        currentPeriodEnd: new Date('2030-08-01'),
        planSnapshot: snapshot(20),
        plan: Object.assign(new MembershipPlan(), { includedStorageBytes: 99 })
    })
    const period = Object.assign(new MembershipPeriod(), {
        status: MembershipPeriodStatusEnum.Active,
        planSnapshot: snapshot(30)
    })
    const memberships = { findOne: jest.fn().mockResolvedValue(membership) }
    const periods = { findOne: jest.fn().mockResolvedValue(period) }
    const manager = { getRepository: (entity: unknown) => (entity === UserMembership ? memberships : periods) }
    return { membership, period, memberships, periods, manager }
}
describe('paid storage entitlement', () => {
    it('uses the immutable current period and scopes every query to the owner', async () => {
        const f = fixture()
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBe(30)
        expect(f.memberships.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { ...scope, status: MembershipStatusEnum.Active } })
        )
        expect(f.periods.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    ...scope,
                    membershipId: 'membership',
                    periodStart: LessThanOrEqual(now),
                    periodEnd: MoreThan(now)
                }
            })
        )
    })
    it('does not grant a foreign, paused or expired membership returned by no active-owner query', async () => {
        const f = fixture()
        f.memberships.findOne.mockResolvedValue(null)
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBeNull()
        expect(f.periods.findOne).not.toHaveBeenCalled()
    })
    it.each([
        MembershipPeriodStatusEnum.Cancelled,
        MembershipPeriodStatusEnum.Completed,
        MembershipPeriodStatusEnum.RefundPending
    ])('does not fall back to old benefits when the current period is %s', async (status) => {
        const f = fixture()
        f.period.status = status
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBeNull()
    })
    it('accepts a paid scheduled period at its start even before the scheduler runs', async () => {
        const f = fixture()
        f.period.status = MembershipPeriodStatusEnum.Scheduled
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBe(30)
    })
    it('uses current legacy snapshots but never substitutes an edited catalog for missing storage', async () => {
        const f = fixture()
        f.periods.findOne.mockResolvedValue(null)
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBe(20)
        delete f.membership.planSnapshot.includedStorageBytes
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBeNull()
        f.membership.planSnapshot = null
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBe(99)
        f.membership.currentPeriodEnd = now
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBeNull()
        f.membership.currentPeriodEnd = new Date('2030-09-01')
        f.membership.currentPeriodStart = new Date('2030-08-01')
        await expect(membershipStorageBytes(f.manager as never, scope, now)).resolves.toBeNull()
    })
    it('uses IS NULL for tenant-scoped membership rather than dropping the organization predicate', async () => {
        const f = fixture()
        await membershipStorageBytes(f.manager as never, { ...scope, organizationId: null }, now)
        expect(f.memberships.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { ...scope, organizationId: IsNull(), status: MembershipStatusEnum.Active }
            })
        )
    })
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid capacity %s', (value) => {
        expect(() => normalizeIncludedStorageBytes(value)).toThrow()
    })
})
