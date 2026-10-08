// Usage is independent of balance deductions. A model fact and its split debit
// entries must count once; unbilled facts still contribute on unlimited/direct access.
import { DEFAULT_MEMBERSHIP_CNY_PER_POINT, MEMBERSHIP_CNY_PER_POINT_SETTING } from '@xpert-ai/contracts'
import type { TenantSetting } from '@xpert-ai/server-core'
import type { Repository } from 'typeorm'
import { MembershipPointLedger } from './membership-point-ledger.entity'

export async function resolveMembershipPointRate(repository: Repository<TenantSetting> | undefined, tenantId: string) {
    const setting = await repository?.findOne({ where: { tenantId, name: MEMBERSHIP_CNY_PER_POINT_SETTING } })
    const rate = Number(setting?.value)
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_MEMBERSHIP_CNY_PER_POINT
}

// Linked settlements preserve historical multipliers/rates, including excess usage.
// Facts without a debit are valued at the tenant's current point conversion rate.
// Missing pricing or currency conversion is unknown, never zero consumption.
export const USAGE_POINTS_SQL = `CASE WHEN ledger.source = 'model_usage' THEN
    CASE WHEN ledger."pricingStatus" = 'free' THEN 0
         WHEN ledger."pricingStatus" = 'priced' THEN COALESCE(
            (SELECT SUM(ABS(debit."pointsDelta") + COALESCE(debit."excessPoints", 0))
             FROM membership_point_ledger debit
             WHERE debit."tenantId" = ledger."tenantId" AND debit."userId" = ledger."userId"
               AND debit.source IN ('usage', 'personal_usage')
               AND debit."sourceReference" IN ('model-usage-charge:' || ledger.id, 'model-usage-charge:' || ledger.id || ':personal')),
            CASE WHEN ledger."gatewayRequestId" IS NOT NULL THEN (
                SELECT SUM(ABS(debit."pointsDelta") + COALESCE(debit."excessPoints", 0))
                FROM membership_point_ledger debit
                WHERE debit."tenantId" = ledger."tenantId" AND debit."userId" = ledger."userId"
                  AND debit.source IN ('usage', 'personal_usage')
                  AND debit."gatewayRequestId" = ledger."gatewayRequestId"
            ) END,
            CASE WHEN ledger."settlementCurrency" = 'CNY' AND ledger."settlementAmount" >= 0
                 THEN ROUND(ledger."settlementAmount" / :usageCnyPerPoint, 10) END)
         ELSE NULL END
    ELSE ABS(ledger."pointsDelta") + COALESCE(ledger."excessPoints", 0) END`

// Build scoped reference sets once; correlated anti-joins scan the entire fact
// history for every legacy debit and make annual overviews prohibitively slow.
export const USAGE_POINTS_PREDICATE = `(ledger.source = 'model_usage' OR (
    ledger.source IN ('usage', 'personal_usage')
    AND (ledger."sourceReference" IS NULL OR ledger."sourceReference" NOT IN (
        SELECT 'model-usage-charge:' || fact.id || suffix.value
        FROM membership_point_ledger fact CROSS JOIN (VALUES (''), (':personal')) AS suffix(value)
        WHERE fact."tenantId" = :tenantId AND fact."userId" = :userId AND fact.source = 'model_usage'
    ))
    AND (ledger."gatewayRequestId" IS NULL OR ledger."gatewayRequestId" NOT IN (
        SELECT fact."gatewayRequestId" FROM membership_point_ledger fact
        WHERE fact."tenantId" = :tenantId AND fact."userId" = :userId AND fact.source = 'model_usage'
          AND fact."gatewayRequestId" IS NOT NULL
    ))
))`

export function createMembershipUsageQuery(
    repository: Repository<MembershipPointLedger>,
    scope: { tenantId: string; userId: string },
    cnyPerPoint: number
) {
    return repository
        .createQueryBuilder('ledger')
        .where('ledger.tenantId = :tenantId', { tenantId: scope.tenantId })
        .andWhere('ledger.userId = :userId', { userId: scope.userId })
        .andWhere(USAGE_POINTS_PREDICATE)
        .setParameter('usageCnyPerPoint', cnyPerPoint)
}

/** Current-cycle consumption across the user's scopes; quota balances remain separate. */
export async function readPeriodConsumedPoints(
    repository: Repository<MembershipPointLedger>,
    settings: Repository<TenantSetting> | undefined,
    scope: { tenantId: string; userId: string; currentPeriodStart: Date; currentPeriodEnd: Date }
) {
    const query = createMembershipUsageQuery(
        repository,
        scope,
        await resolveMembershipPointRate(settings, scope.tenantId)
    )
    const row = await query
        .select(`COALESCE(SUM(${USAGE_POINTS_SQL}), 0)`, 'points')
        .andWhere('COALESCE(ledger.recordedAt, ledger.createdAt) >= :periodStart', {
            periodStart: scope.currentPeriodStart
        })
        .andWhere('COALESCE(ledger.recordedAt, ledger.createdAt) < :periodEnd', { periodEnd: scope.currentPeriodEnd })
        .getRawOne<{ points: string }>()
    return Number(row?.points ?? 0)
}
