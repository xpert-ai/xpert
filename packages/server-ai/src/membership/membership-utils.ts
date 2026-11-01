import { BadRequestException, ForbiddenException } from '@nestjs/common'
import {
    AIPermissionsEnum,
    DEFAULT_MEMBERSHIP_CNY_PER_POINT,
    IMembershipMe,
    IMembershipPlan,
    IMembershipPlanSnapshot,
    IMembershipUsageQuery,
    IMembershipUsageSummary,
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { IsNull } from 'typeorm'
import { ExceedingLimitException } from '../core/errors'
import { createMembershipPlanSnapshot } from './membership-plan-snapshot'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import {
    MembershipModelAccess,
    MembershipScope,
    MembershipUsageSummaryRaw,
    MembershipWithPlan,
    RecordUsageInput,
    ResolveScopeInput
} from './membership.types'
import { pointsFromCny } from './model-billing'
import { UserMembership } from './user-membership.entity'

export const DEFAULT_PLAN_NAME = 'Default'

export const DEFAULT_INCLUDED_POINTS = 1000

export const DEFAULT_TENANT_PLAN_GRANT_REASON = 'Default tenant plan grant'

export const DEFAULT_ORGANIZATION_PLAN_GRANT_REASON = 'Organization membership initialized'

export const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toNumber(value: string | number | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value)
}

export function startOfDay(date: Date) {
    const value = new Date(date)
    value.setHours(0, 0, 0, 0)
    return value
}

export function addMonths(date: Date, months: number) {
    const value = new Date(date)
    const day = value.getDate()
    value.setDate(1)
    value.setMonth(value.getMonth() + months)
    const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
    value.setDate(Math.min(day, lastDay))
    return value
}

export function periodEndFor(start: Date, period: MembershipPeriodEnum) {
    switch (period) {
        case MembershipPeriodEnum.Monthly:
        default:
            return addMonths(start, 1)
    }
}

export function formatDateKey(date: Date) {
    return date.toISOString().slice(0, 10)
}

export function calculatePointsFromCny(amount: number, cnyPerPoint = DEFAULT_MEMBERSHIP_CNY_PER_POINT): number {
    return pointsFromCny(amount, cnyPerPoint)
}

export function cnyFromPoints(points: number, cnyPerPoint: number): number {
    return Number((Math.max(0, points) * cnyPerPoint).toFixed(10))
}

export function nonNegativeBillingAmount(value: number | null | undefined): number {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(10)) : 0
}

export function applySettlementMultiplier(amount: number, multiplier: number): number {
    return Number((amount * Math.max(0, multiplier)).toFixed(10))
}

export function billingLedgerFields(input: RecordUsageInput, settlementAmount: number): Partial<MembershipPointLedger> {
    return {
        priceAmount: input.priceAmount,
        priceCurrency: input.priceCurrency,
        settlementAmount,
        settlementCurrency: input.settlementCurrency ?? 'CNY',
        exchangeRate: input.exchangeRate
    }
}

export function toPresentationAccess(
    persistedMembership: UserMembership,
    plan: IMembershipPlan,
    organizationId: string | null
): MembershipModelAccess {
    return {
        tenantId: persistedMembership.tenantId,
        organizationId,
        persistedMembership: {
            ...persistedMembership,
            plan,
            planId: persistedMembership.planId ?? plan.id
        },
        membership: {
            ...persistedMembership,
            plan,
            planId: persistedMembership.planId ?? plan.id
        }
    }
}

export function resolveFallbackPeriod(membership: MembershipWithPlan, period: MembershipPeriodEnum) {
    const now = new Date()
    const membershipEnd = new Date(membership.currentPeriodEnd)
    let start = membershipEnd.getTime() <= now.getTime() ? membershipEnd : now
    let end = periodEndFor(start, period)
    while (end.getTime() <= now.getTime()) {
        start = end
        end = periodEndFor(start, period)
    }
    return { start, end }
}

export function shouldSelfHealOrganizationAccess(
    organizationId?: string | null,
    copilotOrganizationId?: string | null
) {
    const normalizedOrganizationId = normalizeScopeOrganizationId(organizationId)
    return (
        !!normalizedOrganizationId && normalizedOrganizationId === normalizeScopeOrganizationId(copilotOrganizationId)
    )
}

export function userHasMembershipUsePermission(user: User | null | undefined) {
    return (
        user?.type === UserType.USER &&
        !!user.role?.rolePermissions?.some(
            (permission) => permission.enabled && permission.permission === AIPermissionsEnum.MEMBERSHIP_USE
        )
    )
}

export function createPlanSnapshot(plan: IMembershipPlan): IMembershipPlanSnapshot {
    return createMembershipPlanSnapshot(plan)
}

export function copyPlanSnapshot(snapshot: IMembershipPlanSnapshot, planId: string): IMembershipPlanSnapshot {
    return {
        ...snapshot,
        planId,
        allowedModels: snapshot.allowedModels?.map((rule) => ({ ...rule })),
        modelMultipliers: snapshot.modelMultipliers?.map((rule) => ({ ...rule })),
        rateLimits: snapshot.rateLimits?.map((rule) => ({ ...rule }))
    }
}

export function planFromSnapshot(
    snapshot: IMembershipPlanSnapshot,
    tenantId: string,
    organizationId: string | null
): IMembershipPlan {
    return {
        id: snapshot.planId ?? '',
        tenantId,
        organizationId,
        code: snapshot.code,
        name: snapshot.name,
        description: snapshot.description ?? null,
        level: Number.isInteger(snapshot.level) ? snapshot.level : 0,
        catalogSourcePlanId: snapshot.catalogSourcePlanId ?? null,
        status: MembershipPlanStatusEnum.Active,
        isDefault: false,
        period: snapshot.period,
        includedPoints: snapshot.includedPoints,
        allowedModels: snapshot.allowedModels?.map((rule) => ({ ...rule })),
        modelMultipliers: snapshot.modelMultipliers?.map((rule) => ({ ...rule })),
        rateLimits: snapshot.rateLimits?.map((rule) => ({ ...rule }))
    }
}

export function hydrateMembershipPlanSnapshot(membership: UserMembership): MembershipWithPlan {
    if (membership.planSnapshot) {
        membership.plan = planFromSnapshot(
            membership.planSnapshot,
            membership.tenantId,
            membership.organizationId ?? null
        )
    }
    if (!membership.plan) {
        throw new BadRequestException('Membership plan not found.')
    }
    return membership as MembershipWithPlan
}

export function requireNonNegativePointDelta(value: unknown) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.MembershipUpgradePointsInvalid',
                'Membership upgrade points must be a non-negative integer.'
            )
        )
    }
    return numberValue
}

export function rateLimitStart(period: string, cycleStart: Date) {
    const now = new Date()
    if (period === 'cycle') {
        return cycleStart
    }
    if (period === 'week') {
        const start = startOfDay(now)
        start.setDate(start.getDate() - start.getDay())
        return start
    }
    if (period === 'day') {
        return startOfDay(now)
    }
    const start = new Date(now)
    start.setMinutes(0, 0, 0)
    return start
}

export function applyMembershipUsageLedgerFilter<
    T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }
>(qb: T, membershipId: string | undefined, organizationId: string | null) {
    if (membershipId) {
        qb.andWhere(
            '(ledger.membershipId = :membershipId OR (ledger.membershipId IS NULL AND ledger.source = :personalUsageSource))',
            {
                membershipId,
                personalUsageSource: MembershipLedgerSourceEnum.PersonalUsage
            }
        )
    } else {
        qb.andWhere('ledger.membershipId IS NULL AND ledger.source = :personalUsageSource', {
            personalUsageSource: MembershipLedgerSourceEnum.PersonalUsage
        })
    }
    applyScopeFilter(qb, 'ledger.organizationId', organizationId)
    return qb
}

export function applyLedgerFilters<T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }>(
    qb: T,
    query?: IMembershipUsageQuery
) {
    if (query?.usageChannel) {
        qb.andWhere('ledger.usageChannel = :usageChannel', { usageChannel: query.usageChannel })
    }
    if (query?.provider) {
        qb.andWhere('ledger.provider = :provider', { provider: query.provider })
    }
    if (query?.model) {
        qb.andWhere('ledger.model = :model', { model: query.model })
    }
    if (query?.organizationId) {
        qb.andWhere('ledger.organizationId = :organizationId', { organizationId: query.organizationId })
    }
    if (query?.xpertId) {
        qb.andWhere('ledger.xpertId = :xpertId', { xpertId: query.xpertId })
    }
    if (query?.threadId) {
        qb.andWhere('ledger.threadId = :threadId', { threadId: query.threadId })
    }
    if (query?.copilotId) {
        qb.andWhere('ledger.copilotId = :copilotId', { copilotId: query.copilotId })
    }
    if (query?.usageHour) {
        qb.andWhere('ledger.usageHour = :usageHour', { usageHour: query.usageHour })
    }
    return qb
}

export function toUsageSummary(row: MembershipUsageSummaryRaw): IMembershipUsageSummary {
    const groupKey = {
        usageHour: row.usageHour,
        usageChannel: row.usageChannel,
        provider: row.provider,
        model: row.model,
        organizationId: row.organizationId,
        xpertId: row.xpertId,
        threadId: row.threadId,
        copilotId: row.copilotId
    }

    return {
        ...groupKey,
        groupKey,
        conversationTitle: row.conversationTitle,
        xpertTitle: row.xpertTitle,
        xpertName: row.xpertName,
        callCount: toNumber(row.callCount),
        pointsDelta: toNumber(row.pointsDelta),
        pointsUsed: toNumber(row.pointsUsed),
        tokenUsed: toNumber(row.tokenUsed),
        firstUsedAt: row.firstUsedAt,
        lastUsedAt: row.lastUsedAt
    }
}

export function resolveDateRange(query?: IMembershipUsageQuery) {
    const end = query?.end ? new Date(query.end) : new Date()
    const start = query?.start ? new Date(query.start) : new Date(end)
    if (!query?.start) {
        start.setDate(start.getDate() - 29)
        start.setHours(0, 0, 0, 0)
    }
    return { start, end }
}

export function toMembershipMe(
    membership: MembershipWithPlan,
    personalPointsBalance: number,
    personalPointsOnly = false
): IMembershipMe {
    const pointsGranted = membership.pointsGranted ?? null
    const pointsUsed = membership.pointsUsed ?? 0
    return {
        membership,
        plan: membership.plan,
        personalPointsOnly,
        pointsGranted,
        pointsUsed,
        pointsRemaining: pointsGranted === null ? null : Math.max(0, pointsGranted - pointsUsed),
        pointsTotalUsed: (membership.pointsTotalUsed ?? 0) + pointsUsed,
        currentPeriodStart: membership.currentPeriodStart,
        currentPeriodEnd: membership.currentPeriodEnd,
        personalPointsBalance
    }
}

export function getMembershipPointsRemaining(membership: MembershipWithPlan) {
    if (membership.pointsGranted === null) {
        return null
    }
    return Math.max(0, (membership.pointsGranted ?? 0) - (membership.pointsUsed ?? 0))
}

export function assertCopilotScopeMatches(access: MembershipModelAccess, copilotOrganizationId?: string | null) {
    const normalizedCopilotOrganizationId = normalizeScopeOrganizationId(copilotOrganizationId)
    const usesTenantCatalog =
        normalizedCopilotOrganizationId === null &&
        !!access.organizationId &&
        !!access.membership.plan.catalogSourcePlanId
    if (normalizedCopilotOrganizationId !== access.organizationId && !usesTenantCatalog) {
        throw new ExceedingLimitException(
            translateMembershipError(
                'server-ai:Error.CopilotModelUnavailableForMembershipPlan',
                'Copilot model is not available for the current membership plan.'
            )
        )
    }
}

export function translateMembershipError(key: string, fallback: string) {
    const message = t(key, { defaultValue: fallback })
    return typeof message === 'string' && message !== key ? message : fallback
}

export function normalizePlanCode(value: unknown, fallback?: string) {
    const code = typeof value === 'string' ? value.trim() : fallback
    if (!code || code.length > 100) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipPlanCode',
                'Membership plan code is required and must not exceed 100 characters.'
            )
        )
    }
    return code
}

export function normalizePlanName(value: unknown, fallback?: string) {
    const name = typeof value === 'string' ? value.trim() : fallback
    if (!name || name.length > 255) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipPlanName',
                'Membership plan name is required and must not exceed 255 characters.'
            )
        )
    }
    return name
}

export function nonNegativeNumberOrNull(value: unknown, fallback: number) {
    if (value === undefined) {
        return fallback
    }
    if (value === null) {
        return null
    }
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipIncludedPoints',
                'Included points must be a non-negative integer or unlimited.'
            )
        )
    }
    return numberValue
}

export function requireNonZeroPointDelta(value: unknown) {
    const numberValue = Number(value)
    const pointDelta = Number(numberValue.toFixed(3))
    if (
        !Number.isFinite(numberValue) ||
        pointDelta === 0 ||
        Math.abs(numberValue - pointDelta) > Number.EPSILON * Math.max(1, Math.abs(numberValue))
    ) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipPointDelta',
                'Point adjustment must be non-zero and use at most three decimal places.'
            )
        )
    }
    return pointDelta
}

export function slugify(value: string) {
    return (value || DEFAULT_PLAN_NAME)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

export function requireCurrentScope(): MembershipScope {
    return {
        tenantId: requireTenant(),
        organizationId: normalizeScopeOrganizationId(RequestContext.getOrganizationId())
    }
}

export function resolveScope(input?: ResolveScopeInput): MembershipScope {
    return {
        tenantId: input?.tenantId ?? requireTenant(),
        organizationId: normalizeScopeOrganizationId(
            input?.organizationId !== undefined ? input.organizationId : RequestContext.getOrganizationId()
        )
    }
}

export function scopeWhere(tenantId: string, organizationId: string | null) {
    return {
        tenantId,
        organizationId: organizationId ?? IsNull()
    }
}

export function applyScopeFilter<T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }>(
    qb: T,
    column: string,
    organizationId: string | null
) {
    if (organizationId) {
        return qb.andWhere(`${column} = :organizationId`, { organizationId })
    }
    return qb.andWhere(`${column} IS NULL`)
}

export function normalizeScopeOrganizationId(organizationId?: string | null) {
    return organizationId?.trim() || null
}

export function requireTenant() {
    const tenantId = RequestContext.currentTenantId()
    if (!tenantId) {
        throw new ForbiddenException('Tenant is required.')
    }
    return tenantId
}

export function requireUser() {
    const userId = RequestContext.currentUserId()
    if (!userId) {
        throw new ForbiddenException('User is required.')
    }
    return userId
}
