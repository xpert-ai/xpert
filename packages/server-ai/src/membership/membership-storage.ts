// Capacity follows immutable membership period snapshots. Calendar bounds apply even before
// the lifecycle scheduler runs; inactive/refunded benefits never remove stored files.
import { MembershipPeriodStatusEnum, MembershipStatusEnum } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { EntityManager, IsNull, LessThanOrEqual, MoreThan } from 'typeorm'
import { MembershipPeriod } from './membership-period.entity'
import { UserMembership } from './user-membership.entity'

export function normalizeIncludedStorageBytes(value: number | null | undefined): number | null {
    if (value == null) return null
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new BadRequestException(t('server-ai:Error.MembershipStorageInvalid'))
    return value
}

export async function membershipStorageBytes(
    manager: EntityManager,
    scope: { tenantId: string; organizationId?: string | null; userId: string },
    now = new Date()
): Promise<number | null> {
    const identity = {
        tenantId: scope.tenantId,
        userId: scope.userId,
        organizationId: scope.organizationId ?? IsNull()
    }
    const membership = await manager.getRepository(UserMembership).findOne({
        where: { ...identity, status: MembershipStatusEnum.Active },
        relations: ['plan'],
        order: { updatedAt: 'DESC' }
    })
    if (!membership) return null
    const period = await manager.getRepository(MembershipPeriod).findOne({
        where: {
            ...identity,
            membershipId: membership.id,
            periodStart: LessThanOrEqual(now),
            periodEnd: MoreThan(now)
        },
        order: { periodStart: 'DESC' }
    })
    if (period) {
        if (![MembershipPeriodStatusEnum.Active, MembershipPeriodStatusEnum.Scheduled].includes(period.status))
            return null
        return normalizeIncludedStorageBytes(period.planSnapshot?.includedStorageBytes)
    }
    if (membership.currentPeriodStart > now || membership.currentPeriodEnd <= now) return null
    // A legacy paid snapshot without this field retains base capacity, not today's edited catalog.
    return normalizeIncludedStorageBytes(
        membership.planSnapshot ? membership.planSnapshot.includedStorageBytes : membership.plan?.includedStorageBytes
    )
}
