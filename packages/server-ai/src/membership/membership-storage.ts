// Capacity follows immutable membership period snapshots. Calendar bounds apply even before
// the lifecycle scheduler runs; inactive/refunded benefits never remove stored files.
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { EntityManager } from 'typeorm'
import { z } from 'zod/v3'

export function normalizeIncludedStorageBytes(value: number | null | undefined): number | null {
    if (value == null) return null
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new BadRequestException(t('server-ai:Error.MembershipStorageInvalid'))
    return value
}

/** Organization grants survive member removal; purchase/refund updates and calendar bounds still apply. */
export async function organizationMembershipStorageBytes(
    manager: EntityManager,
    scope: { tenantId: string; organizationId: string },
    now = new Date()
): Promise<number | null> {
    if (!scope.tenantId || !scope.organizationId)
        throw new BadRequestException(t('server-ai:Error.MembershipStorageInvalid'))
    const rows = z.array(z.object({ bytes: z.coerce.number().nullable() })).parse(
        await manager.query(
            `SELECT max(bytes) AS bytes FROM app_platform_storage_grant
         WHERE "tenantId"=$1 AND "organizationId"=$2 AND enabled AND NOT paused
           AND "startsAt" <= $3 AND "endsAt" > $3`,
            [scope.tenantId, scope.organizationId, now]
        )
    )
    return normalizeIncludedStorageBytes(rows[0]?.bytes)
}
