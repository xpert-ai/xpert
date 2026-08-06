import {
    AiFeatureEnum,
    IMembershipAdminUser,
    IMembershipAdminUsersQuery,
    IMembershipBulkActionResult,
    IMembershipAllowedModel,
    IMembershipMe,
    IMembershipModelMultiplier,
    IMembershipPlan,
    IMembershipPlanSnapshot,
    IMembershipRateLimit,
    IMembershipScopeStatus,
    IMembershipUsageSummary,
    IMembershipUsageOverview,
    IMembershipUsageQuery,
    IModelAccessResolution,
    IPagination,
    DEFAULT_MEMBERSHIP_TOKENS_PER_POINT,
    MEMBERSHIP_TOKENS_PER_POINT_SETTING,
    MEMBERSHIP_TOKENS_PER_POINT_OPTIONS,
    MembershipLedgerSourceEnum,
    MembershipAdminUserStatusEnum,
    MembershipBulkActionEnum,
    MembershipPeriodEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    ModelAccessSourceEnum,
    ModelGatewayUsageChannelEnum,
    UserType,
    TMembershipAssignInput,
    TMembershipBulkActionInput,
    TMembershipCurrentPeriodUpgradeInput,
    TMembershipOrganizationPurchasePlanInput,
    TMembershipPeriodCancelInput,
    TMembershipPeriodsAppendInput,
    TMembershipPeriodsRefundReservationInput,
    TMembershipPlanReassignInput,
    TMembershipPointAdjustInput,
    TMembershipPersonalPointsAdjustmentInput
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/server-common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    FeatureOrganization,
    Organization,
    RequestContext,
    TenantSetting,
    User,
    UserOrganization
} from '@xpert-ai/server-core'
import { t } from 'i18next'
import { Brackets, DataSource, EntityManager, In, IsNull, MoreThan, Repository } from 'typeorm'
import { ExceedingLimitException } from '../core/errors'
import { endOfDayInTimeZone, formatInUTC0 } from '../shared/utils'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPeriod } from './membership-period.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { Copilot } from '../copilot/copilot.entity'
import { MembershipBackfillQueueService } from './membership-backfill.queue'

const DEFAULT_PLAN_NAME = 'Default'
const DEFAULT_INCLUDED_POINTS = 1000
const DEFAULT_TENANT_PLAN_GRANT_REASON = 'Default tenant plan grant'
const DEFAULT_ORGANIZATION_PLAN_GRANT_REASON = 'Organization membership initialized'
const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type RecordUsageInput = {
    tenantId: string
    organizationId?: string | null
    copilotOrganizationId?: string | null
    userId: string
    provider?: string
    model?: string
    tokenUsed?: number
    usageHour?: string
    xpertId?: string
    threadId?: string
    copilotId?: string
    modelAccess?: IModelAccessResolution
}

export type RecordGatewayUsageInput = RecordUsageInput & {
    gatewayRequestId: string
    gatewayApiKeyId: string
    modelAccess: IModelAccessResolution
}

export type RecordGatewayUsageResult = {
    chargedPoints: number
    excessPoints: number
    ledger: MembershipPointLedger | null
}

type BillableUserInput = Pick<RecordUsageInput, 'tenantId' | 'userId' | 'xpertId'>

type MembershipWithPlan = UserMembership & { plan: IMembershipPlan }
type MembershipAdminUserRow = User & { membership?: UserMembership | null }

type MembershipScope = {
    tenantId: string
    organizationId: string | null
}

export interface MembershipPeriodSettlementResult {
    scanned: number
    settled: number
    skipped: number
    failed: number
}

type ResolveScopeInput = {
    tenantId?: string | null
    organizationId?: string | null
}

type EnsureScopeInitializedInput = ResolveScopeInput & {
    assignedById?: string | null
}

type EnsureTenantDefaultMembershipInput = {
    tenantId: string
    userId: string
}

export type MembershipModelAccess = {
    tenantId: string
    organizationId: string | null
    membership: MembershipWithPlan
    persistedMembership?: MembershipWithPlan
    personalPointsOnly?: boolean
}

type NumericRaw = Record<string, string | number | null | undefined>

type MembershipUsageSummaryRaw = NumericRaw & {
    usageHour?: string | null
    usageChannel?: ModelGatewayUsageChannelEnum | null
    provider?: string | null
    model?: string | null
    organizationId?: string | null
    xpertId?: string | null
    threadId?: string | null
    copilotId?: string | null
    conversationTitle?: string | null
    xpertTitle?: string | null
    xpertName?: string | null
    firstUsedAt?: Date | string | null
    lastUsedAt?: Date | string | null
}

function toNumber(value: string | number | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value)
}

function startOfDay(date: Date) {
    const value = new Date(date)
    value.setHours(0, 0, 0, 0)
    return value
}

function addMonths(date: Date, months: number) {
    const value = new Date(date)
    const day = value.getDate()
    value.setDate(1)
    value.setMonth(value.getMonth() + months)
    const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
    value.setDate(Math.min(day, lastDay))
    return value
}

function periodEndFor(start: Date, period: MembershipPeriodEnum) {
    switch (period) {
        case MembershipPeriodEnum.Monthly:
        default:
            return addMonths(start, 1)
    }
}

function formatDateKey(date: Date) {
    return date.toISOString().slice(0, 10)
}

@Injectable()
export class MembershipService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(MembershipPlan)
        private readonly planRepository: Repository<MembershipPlan>,
        @InjectRepository(UserMembership)
        private readonly membershipRepository: Repository<UserMembership>,
        @InjectRepository(MembershipPointLedger)
        private readonly ledgerRepository: Repository<MembershipPointLedger>,
        @InjectRepository(Xpert)
        private readonly xpertRepository: Repository<Xpert>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @Optional()
        @InjectRepository(UserOrganization)
        private readonly userOrganizationRepository?: Repository<UserOrganization>,
        @Optional()
        @InjectRepository(Copilot)
        private readonly copilotRepository?: Repository<Copilot>,
        @Optional()
        @InjectRepository(FeatureOrganization)
        private readonly featureOrganizationRepository?: Repository<FeatureOrganization>,
        @Optional()
        @InjectRepository(TenantSetting)
        private readonly tenantSettingRepository?: Repository<TenantSetting>,
        @InjectRepository(MembershipPeriod)
        private readonly periodRepository?: Repository<MembershipPeriod>,
        @InjectRepository(Organization)
        private readonly organizationRepository?: Repository<Organization>,
        @Optional()
        private readonly backfillQueueService?: MembershipBackfillQueueService
    ) {}

    async isMembershipPlanEnabled(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        return this.isMembershipPlanEnabledForScope(this.resolveScope(input), manager)
    }

    async isMembershipAccessEnabled(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        const scope = this.resolveScope(input)
        if (scope.organizationId && (await this.isMembershipPlanEnabledForScope(scope, manager))) {
            return true
        }
        return this.isMembershipPlanEnabledForScope({ tenantId: scope.tenantId, organizationId: null }, manager)
    }

    async findPlans(): Promise<MembershipPlan[]> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.planRepository.find({
            where: {
                ...this.scopeWhere(tenantId, organizationId),
                catalogSourcePlanId: IsNull()
            },
            order: { isDefault: 'DESC', createdAt: 'ASC' }
        })
    }

    async createPlan(input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const tokensPerPoint = await this.resolveTenantTokensPerPoint(tenantId)
        const name = this.normalizePlanName(input.name, DEFAULT_PLAN_NAME)
        const code = this.normalizePlanCode(input.code, this.slugify(name) || 'plan')
        const status = input.status ?? MembershipPlanStatusEnum.Active
        const isDefault = input.isDefault ?? false
        this.assertDefaultPlanIsActive(status, isDefault)
        const plan = this.planRepository.create({
            tenantId,
            organizationId,
            code,
            name,
            description: input.description,
            level: input.level ?? 0,
            status,
            isDefault,
            period: input.period ?? MembershipPeriodEnum.Monthly,
            includedPoints: this.nonNegativeNumberOrNull(input.includedPoints, DEFAULT_INCLUDED_POINTS),
            tokensPerPoint,
            priceAmount: this.optionalNonNegativeNumber(input.priceAmount),
            priceCurrency: input.priceCurrency,
            allowedModels: this.normalizeAllowedModels(input.allowedModels),
            modelMultipliers: this.normalizeModelMultipliers(input.modelMultipliers),
            rateLimits: this.normalizeRateLimits(input.rateLimits)
        })

        const saved = await this.dataSource.transaction(async (manager) => {
            await this.assertPlanCodeAvailable(
                manager.getRepository(MembershipPlan),
                tenantId,
                organizationId,
                plan.code
            )
            if (plan.isDefault) {
                await this.clearDefaultPlan(tenantId, organizationId, manager)
            }
            return manager.getRepository(MembershipPlan).save(plan)
        })
        if (saved.status === MembershipPlanStatusEnum.Active && saved.isDefault) {
            await this.enqueueDefaultMembershipBackfill({ tenantId, organizationId })
        }
        return saved
    }

    async updatePlan(id: string, input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(MembershipPlan)
            const plan = await repository.findOne({ where: { ...this.scopeWhere(tenantId, organizationId), id } })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }
            if (plan.catalogSourcePlanId) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipCatalogPlanEditNotAllowed',
                        'Catalog-managed organization membership plans cannot be edited directly.'
                    )
                )
            }
            const wasActiveDefault = plan.status === MembershipPlanStatusEnum.Active && plan.isDefault
            const nextStatus = input.status ?? plan.status
            const nextIsDefault = input.isDefault ?? plan.isDefault
            const nextIncludedPoints =
                input.includedPoints === undefined
                    ? plan.includedPoints
                    : this.nonNegativeNumberOrNull(input.includedPoints, DEFAULT_INCLUDED_POINTS)
            const includedPointsChanged =
                input.includedPoints !== undefined && nextIncludedPoints !== plan.includedPoints
            this.assertDefaultPlanIsActive(nextStatus, nextIsDefault)
            if (
                input.status === MembershipPlanStatusEnum.Archived &&
                plan.status !== MembershipPlanStatusEnum.Archived
            ) {
                const membershipCount = await manager
                    .getRepository(UserMembership)
                    .createQueryBuilder('membership')
                    .innerJoin('membership.user', 'membershipUser')
                    .where('membership.tenantId = :tenantId', { tenantId })
                    .andWhere('membership.planId = :planId', { planId: id })
                    .andWhere('membership.status IN (:...statuses)', {
                        statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
                    })
                    .andWhere('membershipUser.type = :userType', { userType: UserType.USER })
                    .getCount()
                if (membershipCount) {
                    throw new BadRequestException(
                        this.translateMembershipError(
                            'server-ai:Error.MembershipPlanInUseCannotArchive',
                            'This membership plan is still assigned to users and cannot be archived.'
                        )
                    )
                }
            }

            if (input.code !== undefined) {
                const code = this.normalizePlanCode(input.code)
                await this.assertPlanCodeAvailable(repository, tenantId, organizationId, code, plan.id)
                plan.code = code
            }
            if (input.name !== undefined) {
                plan.name = this.normalizePlanName(input.name)
            }
            if (input.description !== undefined) {
                plan.description = input.description
            }
            if (input.level !== undefined) {
                plan.level = input.level
            }
            if (input.status !== undefined) {
                plan.status = input.status
            }
            if (input.period !== undefined) {
                plan.period = input.period
            }
            if (input.includedPoints !== undefined) {
                plan.includedPoints = nextIncludedPoints
            }
            if (input.priceAmount !== undefined) {
                plan.priceAmount = this.optionalNonNegativeNumber(input.priceAmount)
            }
            if (input.priceCurrency !== undefined) {
                plan.priceCurrency = input.priceCurrency
            }
            if (input.allowedModels !== undefined) {
                plan.allowedModels = this.normalizeAllowedModels(input.allowedModels)
            }
            if (input.modelMultipliers !== undefined) {
                plan.modelMultipliers = this.normalizeModelMultipliers(input.modelMultipliers)
            }
            if (input.rateLimits !== undefined) {
                plan.rateLimits = this.normalizeRateLimits(input.rateLimits)
            }
            if (input.isDefault !== undefined) {
                plan.isDefault = input.isDefault
                if (plan.isDefault) {
                    await this.clearDefaultPlan(tenantId, organizationId, manager, plan.id)
                }
            }

            const saved = await repository.save(plan)
            if (includedPointsChanged) {
                await this.synchronizeAssignedPlanPoints(manager, saved)
            }
            return {
                saved,
                becameActiveDefault:
                    !wasActiveDefault && saved.status === MembershipPlanStatusEnum.Active && saved.isDefault
            }
        })
        if (result.becameActiveDefault) {
            await this.enqueueDefaultMembershipBackfill({ tenantId, organizationId })
        }
        return result.saved
    }

    async archivePlan(id: string): Promise<MembershipPlan> {
        return this.updatePlan(id, { status: MembershipPlanStatusEnum.Archived, isDefault: false })
    }

    async deletePlan(id: string): Promise<void> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope

        await this.dataSource.transaction(async (manager) => {
            const planRepository = manager.getRepository(MembershipPlan)
            const plan = await planRepository.findOne({
                where: { ...this.scopeWhere(tenantId, organizationId), id }
            })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }
            if (plan.catalogSourcePlanId) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipCatalogPlanDeleteNotAllowed',
                        'Catalog-managed organization membership plans cannot be deleted directly.'
                    )
                )
            }
            if (plan.status !== MembershipPlanStatusEnum.Archived) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPlanMustBeArchivedBeforeDelete',
                        'Archive the membership plan before deleting it.'
                    )
                )
            }

            const membershipCount = await manager
                .getRepository(UserMembership)
                .createQueryBuilder('membership')
                .innerJoin('membership.user', 'membershipUser')
                .where('membership.tenantId = :tenantId', { tenantId })
                .andWhere('membership.planId = :planId', { planId: id })
                .andWhere('membership.status IN (:...statuses)', {
                    statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
                })
                .andWhere('membershipUser.type = :userType', { userType: UserType.USER })
                .getCount()
            if (membershipCount) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPlanInUseCannotDelete',
                        'This membership plan is still assigned to users and cannot be deleted.'
                    )
                )
            }

            await planRepository.remove(plan)
        })
    }

    async reassignPlanMembers(planId: string, input: TMembershipPlanReassignInput) {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        if (planId === input.targetPlanId) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPlanReassignSamePlan',
                    'Select a different target membership plan.'
                )
            )
        }

        return this.dataSource.transaction(async (manager) => {
            const planRepository = manager.getRepository(MembershipPlan)
            const [sourcePlan, targetPlan] = await Promise.all([
                planRepository.findOne({
                    where: {
                        ...this.scopeWhere(tenantId, organizationId),
                        id: planId,
                        catalogSourcePlanId: IsNull()
                    }
                }),
                planRepository.findOne({
                    where: {
                        ...this.scopeWhere(tenantId, organizationId),
                        id: input.targetPlanId,
                        status: MembershipPlanStatusEnum.Active,
                        catalogSourcePlanId: IsNull()
                    }
                })
            ])
            if (!sourcePlan || !targetPlan) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPlanNotFound',
                        'Membership plan not found.'
                    )
                )
            }

            const membershipRepository = manager.getRepository(UserMembership)
            const qb = membershipRepository
                .createQueryBuilder('membership')
                .innerJoin('membership.user', 'membershipUser')
                .where('membership.tenantId = :tenantId', { tenantId })
                .andWhere('membership.planId = :planId', { planId })
                .andWhere('membership.status IN (:...statuses)', {
                    statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
                })
                .andWhere('membershipUser.type = :userType', { userType: UserType.USER })
                .setLock('pessimistic_write')
            this.applyScopeFilter(qb, 'membership.organizationId', organizationId)
            const memberships = await qb.getMany()
            const start = new Date()

            for (const membership of memberships) {
                membership.pointsTotalUsed = (membership.pointsTotalUsed ?? 0) + (membership.pointsUsed ?? 0)
                membership.planId = targetPlan.id
                membership.pointsGranted = targetPlan.includedPoints
                membership.pointsUsed = 0
                membership.currentPeriodStart = start
                membership.currentPeriodEnd = periodEndFor(start, targetPlan.period)
                membership.assignedById = RequestContext.currentUserId()
                await membershipRepository.save(membership)
                await this.createLedger(manager, {
                    tenantId,
                    organizationId,
                    userId: membership.userId,
                    membershipId: membership.id,
                    planId: targetPlan.id,
                    source: MembershipLedgerSourceEnum.Assignment,
                    pointsDelta: targetPlan.includedPoints ?? 0,
                    reason: `Reassigned from ${sourcePlan.code}`
                })
            }

            return { updated: memberships.length }
        })
    }

    async getScopeStatus(input?: ResolveScopeInput, manager?: EntityManager): Promise<IMembershipScopeStatus> {
        const scope = this.resolveScope(input)
        await this.assertMembershipPlanFeatureEnabled(scope, manager)
        return this.buildScopeStatus(scope, manager)
    }

    async ensureScopeInitialized(
        input?: EnsureScopeInitializedInput,
        manager?: EntityManager
    ): Promise<IMembershipScopeStatus> {
        const scope = this.resolveScope(input)
        if (!(await this.isMembershipPlanEnabledForScope(scope, manager))) {
            if (!input) {
                await this.assertMembershipPlanFeatureEnabled(scope, manager)
            }
            return this.buildScopeStatus(scope, manager)
        }
        if (!scope.organizationId) {
            if (!(await this.hasActivePlan(scope.tenantId, scope.organizationId, manager))) {
                return this.buildScopeStatus(scope, manager)
            }
            await this.enqueueTenantDefaultMembershipBackfill(scope.tenantId)
            return this.buildScopeStatus(scope, manager)
        }
        if (!(await this.hasActivePlan(scope.tenantId, scope.organizationId, manager))) {
            await this.enqueueOrganizationDefaultMembershipBackfill(scope.tenantId, scope.organizationId)
            return this.buildScopeStatus(scope, manager)
        }

        const initialize = async (txManager: EntityManager) => {
            const plan = await this.ensureDefaultOrganizationPlan(scope, txManager)
            if (plan) {
                await this.ensureOrganizationMemberMemberships(scope, plan, input?.assignedById ?? null, txManager)
            }
            return this.buildScopeStatus(scope, txManager)
        }

        return manager ? initialize(manager) : this.dataSource.transaction(initialize)
    }

    async ensureUserAssignedIfScopeInitialized(input: EnsureScopeInitializedInput & { userId: string }) {
        const scope = this.resolveScope(input)
        if (!(await this.isMembershipPlanEnabledForScope(scope))) {
            return null
        }
        if (!scope.organizationId) {
            return null
        }
        if (!(await this.hasActivePlan(scope.tenantId, scope.organizationId))) {
            return null
        }

        await this.ensureScopeInitialized(input)
        return this.findActiveMembership(scope.tenantId, scope.organizationId, input.userId)
    }

    async revokeOrganizationMembershipForRemovedUser(input: {
        tenantId: string
        organizationId: string
        userId: string
    }): Promise<UserMembership | null> {
        return this.dataSource.transaction(async (manager) => {
            await this.acquireMembershipAssignmentLock(manager, input.tenantId, input.organizationId, input.userId)
            const membership = await this.findMembershipForUpdate(
                input.tenantId,
                input.organizationId,
                input.userId,
                [MembershipStatusEnum.Active, MembershipStatusEnum.Paused],
                manager
            )
            if (!membership) {
                return null
            }

            membership.status = MembershipStatusEnum.Expired
            membership.currentPeriodEnd = new Date()
            const saved = (await manager.getRepository(UserMembership).save(membership)) as MembershipWithPlan
            saved.plan = membership.plan
            await this.completeCurrentMembershipPeriod(saved, manager)
            await this.cancelScheduledMembershipPeriods(saved.id, manager, { preserveExternallyManaged: true })
            await this.createMembershipStatusLedger(manager, saved, 'Organization membership removed')
            return saved
        })
    }

    async ensureTenantDefaultMembership(
        input: EnsureTenantDefaultMembershipInput,
        manager?: EntityManager
    ): Promise<UserMembership | null> {
        const scope: MembershipScope = {
            tenantId: input.tenantId,
            organizationId: null
        }
        if (!(await this.isMembershipPlanEnabledForScope(scope, manager))) {
            return null
        }
        if (!(await this.isMembershipEligibleUser(scope.tenantId, input.userId))) {
            return null
        }

        const ensure = async (txManager: EntityManager) => {
            const plan = await this.findDefaultPlan(scope.tenantId, scope.organizationId, txManager)
            if (!plan) {
                return null
            }
            return (await this.ensureTenantDefaultMembershipWithPlan(input, plan, txManager)).membership
        }

        return manager ? ensure(manager) : this.dataSource.transaction(ensure)
    }

    async backfillTenantDefaultMembershipBatch(input: {
        tenantId: string
        afterUserId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }> {
        const scope: MembershipScope = {
            tenantId: input.tenantId,
            organizationId: null
        }
        const defaultPlan = await this.ensureDefaultTenantPlanForEmptyScope(input.tenantId)
        if (!defaultPlan) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }
        const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), 500)
        const users = await this.userRepository.find({
            select: ['id'],
            where: {
                tenantId: input.tenantId,
                type: UserType.USER,
                ...(input.afterUserId ? { id: MoreThan(input.afterUserId) } : {})
            },
            order: { id: 'ASC' },
            take: take + 1
        })
        const batch = users.slice(0, take)
        if (!batch.length) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }
        const userIds = batch.map((user) => user.id)
        const nextCursor = users.length > take ? userIds[userIds.length - 1] : null

        const result = await this.dataSource.transaction(async (manager) => {
            if (!(await this.isMembershipPlanEnabledForScope(scope, manager))) {
                return { assigned: 0, canContinue: false }
            }
            const plan = await this.findDefaultPlan(input.tenantId, null, manager)
            if (!plan) {
                return { assigned: 0, canContinue: false }
            }

            const existingMemberships = await manager.getRepository(UserMembership).find({
                select: ['userId'],
                where: {
                    ...this.scopeWhere(input.tenantId, null),
                    userId: In(userIds)
                }
            })
            const existingUserIds = new Set(existingMemberships.map((membership) => membership.userId))
            let created = 0

            for (const userId of userIds) {
                if (existingUserIds.has(userId)) {
                    continue
                }
                const assignment = await this.ensureTenantDefaultMembershipWithPlan(
                    {
                        tenantId: input.tenantId,
                        userId
                    },
                    plan,
                    manager
                )
                if (assignment.created) {
                    created++
                }
            }
            return { assigned: created, canContinue: true }
        })

        return {
            scanned: batch.length,
            assigned: result.assigned,
            nextCursor: result.canContinue ? nextCursor : null
        }
    }

    async backfillOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        organizationId: string
        afterUserOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }> {
        const scope: MembershipScope = {
            tenantId: input.tenantId,
            organizationId: input.organizationId
        }
        const defaultPlan = await this.dataSource.transaction(async (manager) => {
            if (!(await this.isMembershipPlanEnabledForScope(scope, manager))) {
                return null
            }
            return this.ensureDefaultOrganizationPlan(scope, manager)
        })
        if (!defaultPlan || !this.userOrganizationRepository?.find) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }

        const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), 500)
        const organizationMemberships = await this.userOrganizationRepository.find({
            select: ['id', 'userId'],
            where: {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                isActive: true,
                ...(input.afterUserOrganizationId ? { id: MoreThan(input.afterUserOrganizationId) } : {})
            },
            order: { id: 'ASC' },
            take: take + 1
        })
        const batch = organizationMemberships.slice(0, take)
        if (!batch.length) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }

        const candidateUserIds = Array.from(new Set(batch.map((membership) => membership.userId).filter(Boolean)))
        const candidateUserIdSet = new Set(candidateUserIds)
        const users = candidateUserIds.length
            ? await this.userRepository.find({
                  select: ['id'],
                  where: {
                      tenantId: input.tenantId,
                      id: In(candidateUserIds),
                      type: UserType.USER
                  }
              })
            : []
        const eligibleUserIds = users.map((user) => user.id).filter((userId) => candidateUserIdSet.has(userId))
        const nextCursor = organizationMemberships.length > take ? (batch[batch.length - 1]?.id ?? null) : null

        const result = await this.dataSource.transaction(async (manager) => {
            if (!(await this.isMembershipPlanEnabledForScope(scope, manager))) {
                return { assigned: 0, canContinue: false }
            }
            const plan = await this.findDefaultPlan(input.tenantId, input.organizationId, manager)
            if (!plan) {
                return { assigned: 0, canContinue: false }
            }

            const activeOrganizationMemberships = eligibleUserIds.length
                ? await manager.getRepository(UserOrganization).find({
                      select: ['userId'],
                      where: {
                          tenantId: input.tenantId,
                          organizationId: input.organizationId,
                          userId: In(eligibleUserIds),
                          isActive: true
                      }
                  })
                : []
            const activeUserIds = new Set(activeOrganizationMemberships.map((membership) => membership.userId))
            let created = 0
            for (const userId of eligibleUserIds) {
                if (!activeUserIds.has(userId)) {
                    continue
                }
                const assignment = await this.ensureOrganizationMemberMembershipWithPlan(
                    {
                        tenantId: input.tenantId,
                        organizationId: input.organizationId,
                        userId
                    },
                    plan,
                    null,
                    manager
                )
                if (assignment.created) {
                    created++
                }
            }
            return { assigned: created, canContinue: true }
        })

        return {
            scanned: batch.length,
            assigned: result.assigned,
            nextCursor: result.canContinue ? nextCursor : null
        }
    }

    private async ensureTenantDefaultMembershipWithPlan(
        input: EnsureTenantDefaultMembershipInput,
        plan: MembershipPlan,
        manager: EntityManager
    ): Promise<{
        membership: UserMembership | null
        created: boolean
    }> {
        await this.acquireTenantDefaultMembershipLock(manager, input.tenantId, input.userId)
        const existingMembership = await this.findManagedMembershipForUpdate(
            input.tenantId,
            null,
            input.userId,
            manager
        )
        if (existingMembership) {
            return {
                membership: existingMembership.status === MembershipStatusEnum.Active ? existingMembership : null,
                created: false
            }
        }

        const start = new Date()
        const repository = manager.getRepository(UserMembership)
        const membership = await repository.save(
            repository.create({
                tenantId: input.tenantId,
                organizationId: null,
                userId: input.userId,
                planId: plan.id,
                status: MembershipStatusEnum.Active,
                source: MembershipSourceEnum.TenantDefault,
                renewalMode: MembershipRenewalModeEnum.Auto,
                currentPeriodStart: start,
                currentPeriodEnd: periodEndFor(start, plan.period),
                pointsGranted: plan.includedPoints,
                pointsUsed: 0,
                pointsTotalUsed: 0,
                note: DEFAULT_TENANT_PLAN_GRANT_REASON
            })
        )
        membership.plan = plan
        await this.createLedger(manager, {
            tenantId: input.tenantId,
            organizationId: null,
            userId: input.userId,
            membershipId: membership.id,
            planId: plan.id,
            source: MembershipLedgerSourceEnum.Grant,
            pointsDelta: plan.includedPoints ?? 0,
            reason: DEFAULT_TENANT_PLAN_GRANT_REASON
        })
        return {
            membership,
            created: true
        }
    }

    private async enqueueTenantDefaultMembershipBackfill(tenantId: string) {
        await this.backfillQueueService?.enqueueTenantDefaultMembershipBackfill(tenantId)
    }

    private async enqueueOrganizationDefaultMembershipBackfill(tenantId: string, organizationId: string) {
        await this.backfillQueueService?.enqueueOrganizationDefaultMembershipBackfill(tenantId, organizationId)
    }

    private async enqueueDefaultMembershipBackfill(scope: MembershipScope) {
        if (scope.organizationId) {
            await this.enqueueOrganizationDefaultMembershipBackfill(scope.tenantId, scope.organizationId)
        } else {
            await this.enqueueTenantDefaultMembershipBackfill(scope.tenantId)
        }
    }

    private async ensureDefaultTenantPlanForEmptyScope(tenantId: string): Promise<MembershipPlan | null> {
        const scope: MembershipScope = { tenantId, organizationId: null }
        return this.dataSource.transaction(async (manager) => {
            await this.acquireTenantDefaultPlanInitializationLock(manager, tenantId)
            if (!(await this.isMembershipPlanEnabledForScope(scope, manager))) {
                return null
            }

            const defaultPlan = await this.findDefaultPlan(tenantId, null, manager)
            if (defaultPlan) {
                return defaultPlan
            }

            const repository = manager.getRepository(MembershipPlan)
            const existingPlans = await repository.find({
                where: {
                    ...this.scopeWhere(tenantId, null),
                    catalogSourcePlanId: IsNull()
                },
                take: 1
            })
            if (existingPlans.length) {
                return null
            }

            const tokensPerPoint = await this.resolveTenantTokensPerPoint(tenantId)
            return repository.save(
                repository.create({
                    tenantId,
                    organizationId: null,
                    code: 'default',
                    name: DEFAULT_PLAN_NAME,
                    level: 0,
                    status: MembershipPlanStatusEnum.Active,
                    isDefault: true,
                    period: MembershipPeriodEnum.Monthly,
                    includedPoints: DEFAULT_INCLUDED_POINTS,
                    tokensPerPoint,
                    allowedModels: [],
                    modelMultipliers: [],
                    rateLimits: []
                })
            )
        })
    }

    private async acquireTenantDefaultPlanInitializationLock(manager: EntityManager, tenantId: string) {
        if (manager.connection.options.type !== 'postgres') {
            return
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            'tenant-default-membership-plan'
        ])
    }

    private async acquireOrganizationDefaultPlanInitializationLock(
        manager: EntityManager,
        tenantId: string,
        organizationId: string
    ) {
        if (manager.connection.options.type !== 'postgres') {
            return
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            `organization-default-membership-plan:${organizationId}`
        ])
    }

    private async acquireTenantDefaultMembershipLock(manager: EntityManager, tenantId: string, userId: string) {
        if (manager.connection.options.type !== 'postgres') {
            return
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            `tenant-default-membership:${userId}`
        ])
    }

    private async acquireMembershipAssignmentLock(
        manager: EntityManager,
        tenantId: string,
        organizationId: string | null,
        userId: string
    ) {
        if (!organizationId) {
            return this.acquireTenantDefaultMembershipLock(manager, tenantId, userId)
        }
        if (manager.connection.options.type !== 'postgres') {
            return
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            `organization-membership:${organizationId}:${userId}`
        ])
    }

    private async acquirePersonalPointsLock(manager: EntityManager, tenantId: string, userId: string) {
        if (manager.connection.options.type !== 'postgres') {
            return
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            `personal-membership-points:${userId}`
        ])
    }

    private async acquireGatewayRequestLock(manager: EntityManager, tenantId: string, requestId: string) {
        if (manager.connection.options.type !== 'postgres') {
            return
        }
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            `model-gateway-request:${requestId}`
        ])
    }

    private async acquirePersonalPointsSourceLock(manager: EntityManager, tenantId: string, sourceReference: string) {
        if (manager.connection.options.type !== 'postgres') {
            return
        }

        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
            tenantId,
            `personal-membership-points-source:${sourceReference}`
        ])
    }

    private async getPersonalPointsBalance(tenantId: string, userId: string, manager?: EntityManager) {
        const repository = manager?.getRepository(MembershipPointLedger) ?? this.ledgerRepository
        const row = await repository
            .createQueryBuilder('ledger')
            .select('COALESCE(SUM(ledger.pointsDelta), 0)', 'balance')
            .where('ledger.tenantId = :tenantId', { tenantId })
            .andWhere('ledger.userId = :userId', { userId })
            .andWhere('ledger.membershipId IS NULL')
            .getRawOne<NumericRaw>()
        return Math.max(0, toNumber(row?.balance))
    }

    async findAdminUsers(options?: {
        userId?: string
        planId?: string
        take?: number
        skip?: number
    }): Promise<IPagination<UserMembership>> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope

        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const qb = this.membershipRepository
            .createQueryBuilder('membership')
            .leftJoinAndSelect('membership.user', 'user')
            .leftJoinAndSelect('membership.plan', 'plan')
            .where('membership.tenantId = :tenantId', { tenantId })
            .andWhere('user.type = :userType', { userType: UserType.USER })
            .orderBy('membership.updatedAt', 'DESC')
            .addOrderBy('membership.id', 'DESC')
            .take(take)
            .skip(skip)

        this.applyScopeFilter(qb, 'membership.organizationId', organizationId)

        if (options?.userId) {
            qb.andWhere('membership.userId = :userId', { userId: options.userId })
        } else {
            qb.andWhere('membership.status IN (:...statuses)', {
                statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
            })
        }
        if (options?.planId) {
            qb.andWhere('membership.planId = :planId', { planId: options.planId })
        }

        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async findAdminUserScopeMemberships(userId: string): Promise<UserMembership[]> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        if (scope.organizationId) {
            throw new ForbiddenException()
        }
        await this.assertMembershipEligibleUser(scope.tenantId, userId)

        const memberships = await this.membershipRepository
            .createQueryBuilder('membership')
            .leftJoinAndSelect('membership.plan', 'plan')
            .leftJoinAndSelect('membership.organization', 'organization')
            .where('membership.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('membership.userId = :userId', { userId })
            .andWhere('membership.status IN (:...statuses)', {
                statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
            })
            .orderBy('CASE WHEN membership.organizationId IS NULL THEN 0 ELSE 1 END', 'ASC')
            .addOrderBy('organization.name', 'ASC')
            .addOrderBy(`CASE membership.status WHEN '${MembershipStatusEnum.Active}' THEN 0 ELSE 1 END`, 'ASC')
            .addOrderBy('membership.updatedAt', 'DESC')
            .addOrderBy('membership.id', 'DESC')
            .getMany()

        const currentMemberships = new Map<string, UserMembership>()
        for (const membership of memberships) {
            const scopeKey = membership.organizationId || 'tenant'
            if (!currentMemberships.has(scopeKey)) {
                currentMemberships.set(scopeKey, membership)
            }
        }
        return Array.from(currentMemberships.values())
    }

    async findAdminMembers(options: IMembershipAdminUsersQuery = {}): Promise<IPagination<IMembershipAdminUser>> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const take = Math.min(Math.max(Number(options.take ?? 20), 1), 100)
        const skip = Math.max(Number(options.skip ?? 0), 0)

        const query = this.userRepository
            .createQueryBuilder('user')
            .where('user.tenantId = :tenantId', { tenantId })
            .andWhere('user.type = :userType', { userType: UserType.USER })

        if (organizationId) {
            query.innerJoin(
                UserOrganization,
                'scopeMembership',
                [
                    'scopeMembership.tenantId = user.tenantId',
                    'scopeMembership.userId = user.id',
                    'scopeMembership.organizationId = :organizationId',
                    'scopeMembership.isActive = true'
                ].join(' AND '),
                { organizationId }
            )
        }

        const membershipSubquery = query
            .subQuery()
            .select('candidate.id')
            .from(UserMembership, 'candidate')
            .where('candidate.tenantId = user.tenantId')
            .andWhere('candidate.userId = user.id')

        if (organizationId) {
            membershipSubquery.andWhere('candidate.organizationId = :organizationId')
        } else {
            membershipSubquery.andWhere('candidate.organizationId IS NULL')
        }

        membershipSubquery
            .orderBy(
                `CASE candidate.status
                    WHEN '${MembershipStatusEnum.Active}' THEN 0
                    WHEN '${MembershipStatusEnum.Paused}' THEN 1
                    ELSE 2
                END`,
                'ASC'
            )
            .addOrderBy('candidate.updatedAt', 'DESC')
            .limit(1)

        query
            .leftJoinAndMapOne(
                'user.membership',
                UserMembership,
                'membership',
                `membership.id = (${membershipSubquery.getQuery()})`
            )
            .leftJoinAndSelect('membership.plan', 'membershipPlan')

        const search = options.search?.trim()
        if (search) {
            query.andWhere(
                new Brackets((where) => {
                    where
                        .where('user.email ILIKE :search', { search: `%${search}%` })
                        .orWhere('user.username ILIKE :search', { search: `%${search}%` })
                        .orWhere('user.firstName ILIKE :search', { search: `%${search}%` })
                        .orWhere('user.lastName ILIKE :search', { search: `%${search}%` })
                })
            )
        }

        if (options.status === MembershipAdminUserStatusEnum.Unassigned) {
            query.andWhere('membership.id IS NULL')
        } else if (options.status) {
            query.andWhere('membership.status = :membershipStatus', { membershipStatus: options.status })
        }

        if (options.planId) {
            query.andWhere('membership.planId = :planId', { planId: options.planId })
        }

        if (options.expiringBefore) {
            query.andWhere('membership.currentPeriodEnd <= :expiringBefore', {
                expiringBefore: await this.normalizeAdminExpiringBefore(options.expiringBefore, tenantId)
            })
        }

        const [users, total] = (await query
            .orderBy('user.firstName', 'ASC')
            .addOrderBy('user.lastName', 'ASC')
            .addOrderBy('user.email', 'ASC')
            .addOrderBy('user.id', 'ASC')
            .take(take)
            .skip(skip)
            .getManyAndCount()) as [MembershipAdminUserRow[], number]

        const userIds = users.map(({ id }) => id)
        const scheduledCounts = new Map<string, number>()
        if (userIds.length && this.periodRepository) {
            const countRows = await this.periodRepository
                .createQueryBuilder('period')
                .select('period.userId', 'userId')
                .addSelect('COUNT(*)', 'count')
                .where('period.tenantId = :tenantId', { tenantId })
                .andWhere('period.userId IN (:...userIds)', { userIds })
                .andWhere('period.status = :status', { status: MembershipPeriodStatusEnum.Scheduled })
            this.applyScopeFilter(countRows, 'period.organizationId', organizationId)
            const rows = await countRows.groupBy('period.userId').getRawMany<{ userId: string; count: string }>()
            rows.forEach(({ userId, count }) => scheduledCounts.set(userId, Number(count)))
        }

        return {
            items: users.map((user) => {
                const membership = user.membership ?? null
                delete user.membership
                return {
                    user,
                    membership,
                    scheduledPeriodCount: scheduledCounts.get(user.id) ?? 0
                }
            }),
            total
        }
    }

    async applyBulkUserAction(input: TMembershipBulkActionInput): Promise<IMembershipBulkActionResult> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const userIds = [...new Set(input.userIds)]
        if (!userIds.length || userIds.length > 100) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipBulkSelectionInvalid',
                    'Select between 1 and 100 users.'
                )
            )
        }
        if (input.action === MembershipBulkActionEnum.Assign && !input.planId) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipBulkPlanRequired',
                    'A membership plan is required for bulk assignment.'
                )
            )
        }
        const assignmentPlanId = input.planId

        const result: IMembershipBulkActionResult = { succeeded: 0, failed: [] }
        for (const userId of userIds) {
            try {
                switch (input.action) {
                    case MembershipBulkActionEnum.Assign:
                        if (!assignmentPlanId) {
                            throw new BadRequestException(
                                this.translateMembershipError(
                                    'server-ai:Error.MembershipBulkPlanRequired',
                                    'A membership plan is required for bulk assignment.'
                                )
                            )
                        }
                        await this.assignUser(userId, {
                            planId: assignmentPlanId,
                            renewalMode: input.renewalMode,
                            note: input.note
                        })
                        break
                    case MembershipBulkActionEnum.Renew:
                        await this.renewUser(userId)
                        break
                    case MembershipBulkActionEnum.Pause:
                        await this.pauseUser(userId)
                        break
                    case MembershipBulkActionEnum.Resume:
                        await this.resumeUser(userId)
                        break
                    case MembershipBulkActionEnum.Revoke:
                        await this.revokeUser(userId)
                        break
                }
                result.succeeded++
            } catch (error) {
                result.failed.push({ userId, message: getErrorMessage(error) })
            }
        }
        return result
    }

    async findAdminUserAudit(
        userId: string,
        pagination: { take?: number; skip?: number } = {}
    ): Promise<IPagination<MembershipPointLedger>> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        await this.assertMembershipEligibleUser(scope.tenantId, userId)
        if (scope.organizationId) {
            await this.assertActiveOrganizationMember(scope.tenantId, scope.organizationId, userId)
        }

        const take = Math.min(Math.max(Number(pagination.take ?? 20), 1), 100)
        const skip = Math.max(Number(pagination.skip ?? 0), 0)
        const query = this.ledgerRepository
            .createQueryBuilder('ledger')
            .leftJoinAndSelect('ledger.user', 'user')
            .leftJoinAndSelect('ledger.actor', 'actor')
            .leftJoinAndSelect('ledger.plan', 'plan')
            .leftJoinAndSelect('ledger.membership', 'membership')
            .leftJoinAndSelect('membership.organization', 'organization')
            .where('ledger.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('ledger.userId = :userId', { userId })
            .andWhere('ledger.source NOT IN (:...usageSources)', {
                usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
            })
        if (scope.organizationId) {
            this.applyScopeFilter(query, 'ledger.organizationId', scope.organizationId)
        }
        const [items, total] = await query.orderBy('ledger.createdAt', 'DESC').take(take).skip(skip).getManyAndCount()
        return { items, total }
    }

    async processDueMembershipPeriods(limit = 100): Promise<MembershipPeriodSettlementResult> {
        const batchSize = Math.min(Math.max(Number(limit) || 100, 1), 500)
        const candidates = await this.membershipRepository
            .createQueryBuilder('membership')
            .innerJoinAndSelect('membership.plan', 'plan')
            .where('membership.status = :status', { status: MembershipStatusEnum.Active })
            .andWhere('membership.currentPeriodEnd <= :now', { now: new Date() })
            .andWhere('plan.status = :planStatus', { planStatus: MembershipPlanStatusEnum.Active })
            .orderBy('membership.currentPeriodEnd', 'ASC')
            .take(Math.min(batchSize * 5, 1000))
            .getMany()

        const result: MembershipPeriodSettlementResult = {
            scanned: candidates.length,
            settled: 0,
            skipped: 0,
            failed: 0
        }

        for (const candidate of candidates) {
            if (result.settled >= batchSize) {
                break
            }

            const scope = {
                tenantId: candidate.tenantId,
                organizationId: candidate.organizationId ?? null
            }
            if (!(await this.isMembershipPlanEnabledForScope(scope))) {
                result.skipped++
                continue
            }

            try {
                const settled = await this.dataSource.transaction(async (manager) => {
                    await this.acquireMembershipAssignmentLock(
                        manager,
                        candidate.tenantId,
                        candidate.organizationId ?? null,
                        candidate.userId
                    )
                    const membership = await this.findMembershipForUpdate(
                        candidate.tenantId,
                        candidate.organizationId ?? null,
                        candidate.userId,
                        [MembershipStatusEnum.Active],
                        manager
                    )
                    if (!membership || new Date(membership.currentPeriodEnd).getTime() > Date.now()) {
                        return false
                    }

                    await this.findUsableMembership(
                        candidate.tenantId,
                        candidate.organizationId ?? null,
                        candidate.userId,
                        manager,
                        true
                    )
                    return true
                })
                if (settled) {
                    result.settled++
                } else {
                    result.skipped++
                }
            } catch {
                result.failed++
            }
        }

        return result
    }

    async assignUser(userId: string, input: TMembershipAssignInput): Promise<UserMembership> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const assignedById = RequestContext.currentUserId()
        await this.assertMembershipEligibleUser(tenantId, userId)

        return this.dataSource.transaction(async (manager) => {
            if (organizationId) {
                await this.assertActiveOrganizationMember(tenantId, organizationId, userId, manager)
            }

            const plan = await manager.getRepository(MembershipPlan).findOne({
                where: {
                    ...this.scopeWhere(tenantId, organizationId),
                    id: input.planId,
                    status: MembershipPlanStatusEnum.Active,
                    catalogSourcePlanId: IsNull()
                }
            })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }

            await this.acquireMembershipAssignmentLock(manager, tenantId, organizationId, userId)
            const membership = await this.findMembershipForUpdate(
                tenantId,
                organizationId,
                userId,
                [MembershipStatusEnum.Active, MembershipStatusEnum.Paused],
                manager
            )
            if (membership) {
                this.assertAdminPeriodGrantAllowed(membership)
            }
            const start = input.currentPeriodStart ? new Date(input.currentPeriodStart) : new Date()
            const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : periodEndFor(start, plan.period)
            if (end.getTime() <= start.getTime()) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InvalidMembershipPeriod',
                        'Membership period end must be later than its start.'
                    )
                )
            }
            const repository = manager.getRepository(UserMembership)
            const record =
                membership ??
                repository.create({
                    tenantId,
                    organizationId,
                    userId,
                    status: MembershipStatusEnum.Active,
                    pointsTotalUsed: 0
                })

            if (membership) {
                record.pointsTotalUsed = (record.pointsTotalUsed ?? 0) + (record.pointsUsed ?? 0)
            }

            record.planId = plan.id
            record.plan = plan
            record.status = MembershipStatusEnum.Active
            record.source = input.source ?? MembershipSourceEnum.Admin
            record.renewalMode = input.renewalMode ?? MembershipRenewalModeEnum.Auto
            record.currentPeriodStart = start
            record.currentPeriodEnd = end
            record.pointsGranted = plan.includedPoints
            record.pointsUsed = 0
            record.planSnapshot = null
            record.assignedById = assignedById
            record.note = input.note

            const saved = await repository.save(record)
            await this.synchronizeCurrentPeriodProjection(this.hydrateMembershipPlanSnapshot(saved), manager)
            await this.expireDuplicateManagedMemberships(tenantId, organizationId, userId, saved.id, manager)
            await this.createLedger(manager, {
                tenantId,
                organizationId,
                userId,
                membershipId: saved.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Assignment,
                pointsDelta: plan.includedPoints ?? 0,
                reason: input.note ?? null
            })

            return this.findMembershipById(saved.id, manager)
        })
    }

    async adjustUserPoints(userId: string, input: TMembershipPointAdjustInput): Promise<UserMembership> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const pointDelta = this.requireNonZeroPointDelta(input.pointDelta)

        return this.dataSource.transaction(async (manager) => {
            const membership = await this.requireActiveMembership(tenantId, organizationId, userId, manager, true)
            if (membership.pointsGranted === null) {
                throw new BadRequestException('Cannot adjust points for an unlimited membership.')
            }
            const previousPointsGranted = membership.pointsGranted ?? 0
            membership.pointsGranted = Math.max(0, previousPointsGranted + pointDelta)
            const appliedDelta = membership.pointsGranted - previousPointsGranted
            const saved = await manager.getRepository(UserMembership).save(membership)
            await this.synchronizeCurrentPeriodProjection(this.hydrateMembershipPlanSnapshot(saved), manager)
            await this.createLedger(manager, {
                tenantId,
                organizationId,
                userId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Adjustment,
                pointsDelta: appliedDelta,
                reason: input.reason ?? null
            })
            return this.findMembershipById(saved.id, manager)
        })
    }

    async renewUser(userId: string): Promise<UserMembership> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            const membership = await this.requireManagedMembership(tenantId, organizationId, userId, manager)
            this.assertAdminPeriodGrantAllowed(membership)
            if (
                membership.status === MembershipStatusEnum.Paused &&
                new Date(membership.currentPeriodEnd).getTime() > Date.now()
            ) {
                membership.status = MembershipStatusEnum.Active
                await manager.getRepository(UserMembership).save(membership)
                await this.createMembershipStatusLedger(manager, membership, 'Membership resumed by renewal')
            }
            await this.appendMembershipPeriods(
                {
                    tenantId,
                    organizationId,
                    userId,
                    planId: membership.plan.id,
                    count: 1,
                    source: membership.source,
                    renewalMode: membership.renewalMode
                },
                manager
            )
            return this.findMembershipById(membership.id, manager)
        })
    }

    async appendMembershipPeriods(
        input: TMembershipPeriodsAppendInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        const append = (txManager: EntityManager) => this.appendMembershipPeriodsInTransaction(input, txManager)
        return manager ? append(manager) : this.dataSource.transaction(append)
    }

    async resolveOrganizationPurchasePlan(
        input: TMembershipOrganizationPurchasePlanInput,
        manager?: EntityManager
    ): Promise<MembershipPlan> {
        const resolve = async (txManager: EntityManager) => {
            if (!input.organizationId) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipOrganizationPurchaseScopeRequired',
                        'Organization purchase scope is required.'
                    )
                )
            }
            if (input.planSnapshot.planId !== input.catalogSourcePlanId) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipCatalogSnapshotMismatch',
                        'Catalog membership plan snapshot does not match its source plan.'
                    )
                )
            }
            await this.assertActiveOrganizationMember(input.tenantId, input.organizationId, input.userId, txManager)
            if (txManager.connection.options.type === 'postgres') {
                await txManager.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
                    input.tenantId,
                    `catalog-plan:${input.organizationId}:${input.catalogSourcePlanId}`
                ])
            }

            const repository = txManager.getRepository(MembershipPlan)
            const existing = await repository.findOne({
                where: {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    catalogSourcePlanId: input.catalogSourcePlanId
                }
            })
            if (existing) {
                const snapshot = input.planSnapshot
                existing.name = snapshot.name
                existing.description = snapshot.description ?? null
                existing.level = snapshot.level
                existing.status = MembershipPlanStatusEnum.Active
                existing.period = snapshot.period
                existing.includedPoints = snapshot.includedPoints
                existing.tokensPerPoint = snapshot.tokensPerPoint
                existing.priceAmount = null
                existing.priceCurrency = null
                existing.allowedModels = snapshot.allowedModels?.map((rule) => ({ ...rule }))
                existing.modelMultipliers = snapshot.modelMultipliers?.map((rule) => ({ ...rule }))
                existing.rateLimits = snapshot.rateLimits?.map((rule) => ({ ...rule }))
                return repository.save(existing)
            }

            const snapshot = input.planSnapshot
            return repository.save(
                repository.create({
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    catalogSourcePlanId: input.catalogSourcePlanId,
                    code: `catalog-${input.catalogSourcePlanId.replace(/-/g, '')}`,
                    name: snapshot.name,
                    description: snapshot.description ?? null,
                    level: snapshot.level,
                    status: MembershipPlanStatusEnum.Active,
                    isDefault: false,
                    period: snapshot.period,
                    includedPoints: snapshot.includedPoints,
                    tokensPerPoint: snapshot.tokensPerPoint,
                    priceAmount: null,
                    priceCurrency: null,
                    allowedModels: snapshot.allowedModels?.map((rule) => ({ ...rule })),
                    modelMultipliers: snapshot.modelMultipliers?.map((rule) => ({ ...rule })),
                    rateLimits: snapshot.rateLimits?.map((rule) => ({ ...rule }))
                })
            )
        }

        return manager ? resolve(manager) : this.dataSource.transaction(resolve)
    }

    async upgradeCurrentMembershipPeriod(
        input: TMembershipCurrentPeriodUpgradeInput,
        manager?: EntityManager
    ): Promise<UserMembership> {
        const upgrade = async (txManager: EntityManager) => {
            const organizationId = this.normalizeScopeOrganizationId(input.organizationId)
            const sourceReference = input.sourceReference.trim()
            if (!sourceReference) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipUpgradeSourceReferenceRequired',
                        'Membership upgrade source reference is required.'
                    )
                )
            }
            const pointsDelta = this.requireNonNegativePointDelta(input.pointsDelta)
            await this.assertMembershipEligibleUser(input.tenantId, input.userId)
            await this.acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)

            const ledgerRepository = txManager.getRepository(MembershipPointLedger)
            const existingLedger = await ledgerRepository.findOne({
                where: {
                    tenantId: input.tenantId,
                    sourceReference
                }
            })
            if (
                existingLedger &&
                (existingLedger.userId !== input.userId ||
                    (existingLedger.organizationId ?? null) !== organizationId ||
                    existingLedger.planId !== input.planId ||
                    Number(existingLedger.pointsDelta) !== pointsDelta ||
                    existingLedger.source !== MembershipLedgerSourceEnum.Upgrade ||
                    !existingLedger.membershipId)
            ) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipUpgradeFulfillmentMismatch',
                        'Membership upgrade request does not match the existing fulfillment.'
                    )
                )
            }
            if (existingLedger?.membershipId) {
                return this.findMembershipById(existingLedger.membershipId, txManager)
            }

            const membership = await this.requireActiveMembership(
                input.tenantId,
                organizationId,
                input.userId,
                txManager,
                true
            )
            const plan = await this.resolvePeriodPlan(
                input.tenantId,
                organizationId,
                input.planId,
                input.planSnapshot,
                txManager
            )
            const snapshot = input.planSnapshot
                ? this.copyPlanSnapshot(input.planSnapshot, input.planId)
                : this.createPlanSnapshot(plan)
            const period = await this.ensureCurrentPeriodRecord(membership, txManager)

            membership.planId = plan.id
            membership.plan = plan
            membership.planSnapshot = snapshot
            membership.pointsGranted =
                membership.pointsGranted === null || snapshot.includedPoints === null
                    ? null
                    : Math.max(0, membership.pointsGranted + pointsDelta)
            membership.source = input.source ?? MembershipSourceEnum.External
            membership.renewalMode = input.renewalMode ?? MembershipRenewalModeEnum.Manual

            period.planId = plan.id
            period.plan = plan
            period.planSnapshot = snapshot
            period.pointsGranted = membership.pointsGranted
            period.source = membership.source
            period.renewalMode = membership.renewalMode
            period.sourceReference = sourceReference

            await txManager.getRepository(UserMembership).save(membership)
            await txManager.getRepository(MembershipPeriod).save(period)
            await this.createLedger(txManager, {
                tenantId: input.tenantId,
                organizationId,
                userId: input.userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Upgrade,
                sourceReference,
                actorId: input.actorId,
                pointsDelta,
                reason: 'Current membership period upgraded'
            })
            return this.findMembershipById(membership.id, txManager)
        }

        return manager ? upgrade(manager) : this.dataSource.transaction(upgrade)
    }

    async ensureActiveMembershipPeriod(
        input: {
            tenantId: string
            organizationId: string | null
            userId: string
            membershipId: string
        },
        manager?: EntityManager
    ): Promise<MembershipPeriod> {
        const ensure = async (txManager: EntityManager) => {
            const organizationId = this.normalizeScopeOrganizationId(input.organizationId)
            await this.acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const membership = await this.findMembershipForUpdate(
                input.tenantId,
                organizationId,
                input.userId,
                [MembershipStatusEnum.Active],
                txManager
            )
            if (!membership || membership.id !== input.membershipId) {
                throw new BadRequestException(
                    this.translateMembershipError('server-ai:Error.MembershipNotFound', 'Membership not found.')
                )
            }
            return this.ensureCurrentPeriodRecord(membership, txManager)
        }

        return manager ? ensure(manager) : this.dataSource.transaction(ensure)
    }

    async findMyPeriods(): Promise<MembershipPeriod[]> {
        const scope = this.requireCurrentScope()
        return this.findMembershipPeriods(scope.tenantId, scope.organizationId, RequestContext.currentUserId())
    }

    async findAdminUserPeriods(userId: string): Promise<MembershipPeriod[]> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        await this.assertMembershipEligibleUser(scope.tenantId, userId)
        return this.findMembershipPeriods(scope.tenantId, scope.organizationId || undefined, userId)
    }

    async cancelAdminUserPeriod(userId: string, periodId: string): Promise<MembershipPeriod> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        return this.cancelScheduledMembershipPeriod({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId,
            periodId
        })
    }

    async cancelScheduledMembershipPeriod(
        input: TMembershipPeriodCancelInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod> {
        const cancel = async (txManager: EntityManager) => {
            const organizationId = this.normalizeScopeOrganizationId(input.organizationId)
            await this.acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const repository = txManager.getRepository(MembershipPeriod)
            const period = await repository.findOne({
                where: {
                    ...this.scopeWhere(input.tenantId, organizationId),
                    id: input.periodId,
                    userId: input.userId
                }
            })
            if (!period) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPeriodNotFound',
                        'Membership period not found.'
                    )
                )
            }
            if (period.status !== MembershipPeriodStatusEnum.Scheduled) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPeriodNotScheduled',
                        'Only a scheduled membership period can be cancelled.'
                    )
                )
            }
            const lastScheduledPeriod = await repository.findOne({
                where: {
                    tenantId: input.tenantId,
                    membershipId: period.membershipId,
                    status: In([MembershipPeriodStatusEnum.Scheduled, MembershipPeriodStatusEnum.RefundPending])
                },
                order: { periodEnd: 'DESC' }
            })
            if (lastScheduledPeriod?.id !== period.id) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPeriodCancellationOrder',
                        'Only the last scheduled membership period can be cancelled.'
                    )
                )
            }

            const expectedSourceReference = period.sourceReference?.trim() || null
            const sourceReference = input.sourceReference?.trim() || null
            const isExternallyManaged = period.source === MembershipSourceEnum.External || !!expectedSourceReference
            if (
                isExternallyManaged &&
                (!expectedSourceReference || !sourceReference || sourceReference !== expectedSourceReference)
            ) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.ExternalMembershipPeriodCancellationRequired',
                        'Externally managed periods must be refunded and cancelled by the external billing system.'
                    )
                )
            }

            period.status = MembershipPeriodStatusEnum.Cancelled
            const cancelled = await repository.save(period)
            await this.createLedger(txManager, {
                tenantId: period.tenantId,
                organizationId: period.organizationId ?? null,
                userId: period.userId,
                membershipId: period.membershipId,
                planId: period.planId,
                source: MembershipLedgerSourceEnum.StatusChange,
                pointsDelta: 0,
                reason: 'Scheduled membership period cancelled'
            })
            return cancelled
        }

        return manager ? cancel(manager) : this.dataSource.transaction(cancel)
    }

    async reserveFutureMembershipPeriodsForRefund(
        input: TMembershipPeriodsRefundReservationInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        const reserve = async (txManager: EntityManager) => {
            const organizationId = this.normalizeScopeOrganizationId(input.organizationId)
            const sourceReference = input.sourceReference.trim()
            if (!sourceReference) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipRefundSourceReferenceRequired',
                        'Membership refund source reference is required.'
                    )
                )
            }

            await this.acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const repository = txManager.getRepository(MembershipPeriod)
            const sourcePeriodsQuery = repository
                .createQueryBuilder('period')
                .where('period.tenantId = :tenantId', { tenantId: input.tenantId })
                .andWhere('period.userId = :userId', { userId: input.userId })
                .andWhere('period.sourceReference = :sourceReference', { sourceReference })
                .orderBy('period.periodStart', 'ASC')
                .setLock('pessimistic_write', undefined, ['period'])
            this.applyScopeFilter(sourcePeriodsQuery, 'period.organizationId', organizationId)
            const sourcePeriods = await sourcePeriodsQuery.getMany()
            if (!sourcePeriods.length) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipRefundOrderPeriodsNotFound',
                        'Membership periods for this payment order were not found.'
                    )
                )
            }

            const refundPending = sourcePeriods.filter(
                ({ status }) => status === MembershipPeriodStatusEnum.RefundPending
            )
            if (refundPending.length) {
                return refundPending
            }

            const now = Date.now()
            const refundable = sourcePeriods.filter(
                (period) =>
                    period.status === MembershipPeriodStatusEnum.Scheduled &&
                    new Date(period.periodStart).getTime() > now
            )
            if (!refundable.length) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipRefundNoFuturePeriods',
                        'This payment order has no unstarted membership periods to refund.'
                    )
                )
            }

            const membershipId = refundable[0].membershipId
            if (refundable.some((period) => period.membershipId !== membershipId)) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipRefundMixedMemberships',
                        'Membership refund periods must belong to the same membership.'
                    )
                )
            }
            const tailQuery = repository
                .createQueryBuilder('period')
                .where('period.tenantId = :tenantId', { tenantId: input.tenantId })
                .andWhere('period.membershipId = :membershipId', { membershipId })
                .andWhere('period.status IN (:...statuses)', {
                    statuses: [MembershipPeriodStatusEnum.Scheduled, MembershipPeriodStatusEnum.RefundPending]
                })
                .orderBy('period.periodStart', 'ASC')
                .setLock('pessimistic_write', undefined, ['period'])
            this.applyScopeFilter(tailQuery, 'period.organizationId', organizationId)
            const tailCandidates = await tailQuery.getMany()
            const expectedTailIds = tailCandidates.slice(-refundable.length).map(({ id }) => id)
            const refundableIds = refundable.map(({ id }) => id)
            if (
                expectedTailIds.length !== refundableIds.length ||
                expectedTailIds.some((id, index) => id !== refundableIds[index])
            ) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipRefundTailRequired',
                        'Only a contiguous tail of unstarted membership periods can be refunded.'
                    )
                )
            }

            refundable.forEach((period) => {
                period.status = MembershipPeriodStatusEnum.RefundPending
            })
            return repository.save(refundable)
        }

        return manager ? reserve(manager) : this.dataSource.transaction(reserve)
    }

    async finalizeFutureMembershipPeriodsRefund(
        input: TMembershipPeriodsRefundReservationInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        const finalize = async (txManager: EntityManager) => {
            const organizationId = this.normalizeScopeOrganizationId(input.organizationId)
            const sourceReference = input.sourceReference.trim()
            await this.acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const repository = txManager.getRepository(MembershipPeriod)
            const query = repository
                .createQueryBuilder('period')
                .where('period.tenantId = :tenantId', { tenantId: input.tenantId })
                .andWhere('period.userId = :userId', { userId: input.userId })
                .andWhere('period.sourceReference = :sourceReference', { sourceReference })
                .andWhere('period.status = :status', { status: MembershipPeriodStatusEnum.RefundPending })
                .orderBy('period.periodStart', 'DESC')
                .setLock('pessimistic_write', undefined, ['period'])
            this.applyScopeFilter(query, 'period.organizationId', organizationId)
            const reserved = await query.getMany()
            if (!reserved.length) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipRefundReservationNotFound',
                        'No membership periods are reserved for this refund.'
                    )
                )
            }

            reserved.forEach((period) => {
                period.status = MembershipPeriodStatusEnum.Cancelled
            })
            const cancelled = await repository.save(reserved)
            await this.createLedger(txManager, {
                tenantId: input.tenantId,
                organizationId,
                userId: input.userId,
                membershipId: reserved[0].membershipId,
                planId: reserved[0].planId,
                source: MembershipLedgerSourceEnum.StatusChange,
                pointsDelta: 0,
                reason: `${reserved.length} future membership period${reserved.length === 1 ? '' : 's'} refunded`
            })
            return cancelled
        }

        return manager ? finalize(manager) : this.dataSource.transaction(finalize)
    }

    async pauseUser(userId: string): Promise<UserMembership> {
        return this.changeMembershipStatus(userId, MembershipStatusEnum.Paused)
    }

    async resumeUser(userId: string): Promise<UserMembership> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            let membership = await this.requireManagedMembership(tenantId, organizationId, userId, manager)
            if (membership.status !== MembershipStatusEnum.Paused) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipMustBePaused',
                        'Only a paused membership can be resumed.'
                    )
                )
            }
            if (new Date(membership.currentPeriodEnd).getTime() <= Date.now()) {
                const activated = await this.activateScheduledPeriod(membership, manager)
                if (activated) {
                    membership = activated
                } else {
                    this.assertAdminPeriodGrantAllowed(membership)
                    membership = await this.renewMembership(membership, manager)
                }
            } else {
                membership.status = MembershipStatusEnum.Active
                await manager.getRepository(UserMembership).save(membership)
                await this.createMembershipStatusLedger(manager, membership, 'Membership resumed')
            }
            return this.findMembershipById(membership.id, manager)
        })
    }

    async revokeUser(userId: string): Promise<UserMembership> {
        return this.changeMembershipStatus(userId, MembershipStatusEnum.Expired)
    }

    private async changeMembershipStatus(userId: string, targetStatus: MembershipStatusEnum) {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            const membership = await this.requireManagedMembership(tenantId, organizationId, userId, manager)
            const valid =
                (targetStatus === MembershipStatusEnum.Paused && membership.status === MembershipStatusEnum.Active) ||
                (targetStatus === MembershipStatusEnum.Expired &&
                    [MembershipStatusEnum.Active, MembershipStatusEnum.Paused].includes(membership.status))
            if (!valid) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InvalidMembershipStatusTransition',
                        'The membership status cannot be changed this way.'
                    )
                )
            }

            membership.status = targetStatus
            if (targetStatus === MembershipStatusEnum.Expired) {
                membership.currentPeriodEnd = new Date()
                await this.completeCurrentMembershipPeriod(membership, manager)
                await this.cancelScheduledMembershipPeriods(membership.id, manager, { preserveExternallyManaged: true })
            }
            await manager.getRepository(UserMembership).save(membership)
            await this.createMembershipStatusLedger(
                manager,
                membership,
                targetStatus === MembershipStatusEnum.Paused ? 'Membership paused' : 'Membership revoked'
            )
            return this.findMembershipById(membership.id, manager)
        })
    }

    async getPersonalPoints(userId: string) {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        await this.assertMembershipEligibleUser(scope.tenantId, userId)
        return {
            userId,
            balance: await this.getPersonalPointsBalance(scope.tenantId, userId)
        }
    }

    async adjustPersonalPoints(userId: string, input: TMembershipPointAdjustInput) {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        if (scope.organizationId) {
            throw new ForbiddenException(
                this.translateMembershipError(
                    'server-ai:Error.PersonalPointsTenantOnly',
                    'Personal points can only be managed in tenant scope.'
                )
            )
        }
        await this.assertMembershipEligibleUser(scope.tenantId, userId)
        const pointDelta = this.requireNonZeroPointDelta(input.pointDelta)

        return this.dataSource.transaction(async (manager) => {
            await this.acquirePersonalPointsLock(manager, scope.tenantId, userId)
            const balance = await this.getPersonalPointsBalance(scope.tenantId, userId, manager)
            if (balance + pointDelta < 0) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InsufficientPersonalPoints',
                        'Personal points balance cannot be negative.'
                    )
                )
            }
            await this.createLedger(manager, {
                tenantId: scope.tenantId,
                userId,
                membershipId: null,
                planId: null,
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                pointsDelta: pointDelta,
                reason: input.reason ?? null
            })
            return { userId, balance: balance + pointDelta }
        })
    }

    async applyPersonalPointsAdjustment(input: TMembershipPersonalPointsAdjustmentInput, manager?: EntityManager) {
        const sourceReference = input.sourceReference?.trim()
        if (!sourceReference || sourceReference.length > 191) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidPersonalPointsSourceReference',
                    'Personal points adjustment source reference must be between 1 and 191 characters.'
                )
            )
        }
        const pointDelta = this.requireNonZeroPointDelta(input.pointDelta)
        await this.assertMembershipEligibleUser(input.tenantId, input.userId)

        const apply = async (txManager: EntityManager) => {
            await this.acquirePersonalPointsSourceLock(txManager, input.tenantId, sourceReference)
            await this.acquirePersonalPointsLock(txManager, input.tenantId, input.userId)

            const ledgerRepository = txManager.getRepository(MembershipPointLedger)
            const existing = await ledgerRepository.findOne({
                where: {
                    tenantId: input.tenantId,
                    sourceReference
                }
            })
            if (existing) {
                if (
                    existing.userId !== input.userId ||
                    (existing.membershipId !== null && existing.membershipId !== undefined) ||
                    (existing.planId !== null && existing.planId !== undefined) ||
                    existing.source !== MembershipLedgerSourceEnum.PersonalAdjustment ||
                    Number(existing.pointsDelta) !== pointDelta
                ) {
                    throw new BadRequestException(
                        this.translateMembershipError(
                            'server-ai:Error.PersonalPointsAdjustmentMismatch',
                            'Personal points adjustment does not match the existing fulfillment.'
                        )
                    )
                }
                return {
                    userId: input.userId,
                    balance: await this.getPersonalPointsBalance(input.tenantId, input.userId, txManager)
                }
            }

            const balance = await this.getPersonalPointsBalance(input.tenantId, input.userId, txManager)
            if (balance + pointDelta < 0) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InsufficientPersonalPoints',
                        'Personal points balance cannot be negative.'
                    )
                )
            }
            await this.createLedger(txManager, {
                tenantId: input.tenantId,
                userId: input.userId,
                membershipId: null,
                planId: null,
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                sourceReference,
                actorId: input.actorId,
                pointsDelta: pointDelta,
                reason: input.reason ?? null
            })
            return { userId: input.userId, balance: balance + pointDelta }
        }

        return manager ? apply(manager) : this.dataSource.transaction(apply)
    }

    async getMe(): Promise<IMembershipMe | null> {
        const { tenantId, organizationId } = this.requireCurrentScope()
        const access = await this.findMembershipPresentationAccess(tenantId, organizationId, this.requireUser())
        if (!access) {
            return null
        }
        const personalPointsBalance = await this.getPersonalPointsBalance(tenantId, access.membership.userId)
        return this.toMembershipMe(
            access.persistedMembership ?? access.membership,
            personalPointsBalance,
            !!access.personalPointsOnly
        )
    }

    async getOverview(query?: IMembershipUsageQuery): Promise<IMembershipUsageOverview | null> {
        const { tenantId, organizationId } = this.requireCurrentScope()
        const userId = this.requireUser()
        const access = await this.findMembershipPresentationAccess(tenantId, organizationId, userId)
        if (!access) {
            return null
        }
        const membership = access.membership
        const personalPointsBalance = await this.getPersonalPointsBalance(tenantId, membership.userId)
        const base = this.toMembershipMe(
            access.persistedMembership ?? membership,
            personalPointsBalance,
            !!access.personalPointsOnly
        )
        const { start, end } = this.resolveDateRange(query)

        const dailyRows = await this.applyLedgerFilters(
            this.ledgerRepository
                .createQueryBuilder('ledger')
                .select("DATE_TRUNC('day', ledger.createdAt)", 'day')
                .addSelect('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .where('ledger.tenantId = :tenantId', { tenantId })
                .andWhere('ledger.userId = :userId', { userId })
                .andWhere('ledger.source IN (:...usageSources)', {
                    usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
                })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .groupBy("DATE_TRUNC('day', ledger.createdAt)")
                .orderBy("DATE_TRUNC('day', ledger.createdAt)", 'ASC'),
            query
        ).getRawMany<NumericRaw & { day?: Date | string }>()

        const buckets = dailyRows.map((row) => ({
            date: formatDateKey(new Date(row.day as string)),
            pointsUsed: toNumber(row.pointsUsed),
            tokenUsed: toNumber(row.tokenUsed)
        }))

        const [topModels, topXperts, topThreads] = await Promise.all([
            this.findTopLedgerRanks(tenantId, userId, 'model', query, start, end),
            this.findTopLedgerRanks(tenantId, userId, 'xpertId', query, start, end),
            this.findTopLedgerRanks(tenantId, userId, 'threadId', query, start, end)
        ])

        const totalTokens = buckets.reduce((sum, item) => sum + item.tokenUsed, 0)
        const peakDailyTokens = buckets.reduce((max, item) => Math.max(max, item.tokenUsed), 0)

        return {
            ...base,
            totalTokens,
            peakDailyTokens,
            activeDays: buckets.filter((item) => item.tokenUsed > 0).length,
            buckets,
            topModels,
            topXperts,
            topThreads
        }
    }

    async findMyUsage(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<MembershipPointLedger>> {
        const { tenantId, organizationId } = this.requireCurrentScope()
        const userId = this.requireUser()
        const access = await this.findMembershipPresentationAccess(tenantId, organizationId, userId)
        if (!access) {
            return { items: [], total: 0 }
        }
        return this.findUserUsage(tenantId, userId, query, options)
    }

    async findMyUsageSummaries(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<IMembershipUsageSummary>> {
        const { tenantId, organizationId } = this.requireCurrentScope()
        const userId = this.requireUser()
        const access = await this.findMembershipPresentationAccess(tenantId, organizationId, userId)
        if (!access) {
            return { items: [], total: 0 }
        }
        return this.findUserUsageSummaries(tenantId, userId, query, options)
    }

    async findUserUsageSummaries(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number },
        membershipId?: string,
        organizationId?: string | null
    ): Promise<IPagination<IMembershipUsageSummary>> {
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const { start, end } = this.resolveDateRange(query)
        const qb = this.applyLedgerFilters(
            this.ledgerRepository
                .createQueryBuilder('ledger')
                .select('ledger.usageHour', 'usageHour')
                .addSelect('ledger.usageChannel', 'usageChannel')
                .addSelect('ledger.provider', 'provider')
                .addSelect('ledger.model', 'model')
                .addSelect('ledger.organizationId', 'organizationId')
                .addSelect('ledger.xpertId', 'xpertId')
                .addSelect('ledger.threadId', 'threadId')
                .addSelect('ledger.copilotId', 'copilotId')
                .addSelect('MAX(conversation.title)', 'conversationTitle')
                .addSelect('MAX(usage_xpert.title)', 'xpertTitle')
                .addSelect('MAX(usage_xpert.name)', 'xpertName')
                .addSelect('COUNT(ledger.id) FILTER (WHERE COALESCE(ledger.tokenUsed, 0) > 0)', 'callCount')
                .addSelect('COALESCE(SUM(ledger.pointsDelta), 0)', 'pointsDelta')
                .addSelect('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .addSelect('MIN(ledger.createdAt)', 'firstUsedAt')
                .addSelect('MAX(ledger.createdAt)', 'lastUsedAt')
                .addSelect('COUNT(*) OVER()', 'total')
                .leftJoin(
                    'chat_conversation',
                    'conversation',
                    `"conversation"."tenantId" = ledger."tenantId" AND "conversation"."threadId" = ledger."threadId"`
                )
                .leftJoin(
                    'xpert',
                    'usage_xpert',
                    `"usage_xpert"."tenantId" = ledger."tenantId" AND "usage_xpert"."id"::text = ledger."xpertId"`
                )
                .where('ledger.tenantId = :tenantId', { tenantId })
                .andWhere('ledger.userId = :userId', { userId })
                .andWhere('ledger.source IN (:...usageSources)', {
                    usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
                })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .groupBy('ledger.usageHour')
                .addGroupBy('ledger.usageChannel')
                .addGroupBy('ledger.provider')
                .addGroupBy('ledger.model')
                .addGroupBy('ledger.organizationId')
                .addGroupBy('ledger.xpertId')
                .addGroupBy('ledger.threadId')
                .addGroupBy('ledger.copilotId')
                .orderBy('MAX(ledger.createdAt)', 'DESC')
                .take(take)
                .skip(skip),
            query
        )

        if (membershipId) {
            this.applyMembershipUsageLedgerFilter(qb, membershipId, organizationId ?? null)
        }

        const rows = await qb.getRawMany<MembershipUsageSummaryRaw>()
        return {
            items: rows.map((row) => this.toUsageSummary(row)),
            total: rows.length ? toNumber(rows[0].total) : 0
        }
    }

    async findUserUsage(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number },
        membershipId?: string,
        organizationId?: string | null
    ): Promise<IPagination<MembershipPointLedger>> {
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const { start, end } = this.resolveDateRange(query)
        const qb = this.ledgerRepository
            .createQueryBuilder('ledger')
            .leftJoinAndSelect('ledger.plan', 'plan')
            .where('ledger.tenantId = :tenantId', { tenantId })
            .andWhere('ledger.userId = :userId', { userId })
            .andWhere('ledger.source IN (:...usageSources)', {
                usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
            })
            .andWhere('ledger.createdAt >= :start', { start })
            .andWhere('ledger.createdAt <= :end', { end })
            .orderBy('ledger.createdAt', 'DESC')
            .take(take)
            .skip(skip)

        if (membershipId) {
            this.applyMembershipUsageLedgerFilter(qb, membershipId, organizationId ?? null)
        }

        this.applyLedgerFilters(qb, query)
        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async assertCanUse(
        input: Pick<
            RecordUsageInput,
            'tenantId' | 'organizationId' | 'copilotOrganizationId' | 'userId' | 'xpertId' | 'provider' | 'model'
        >,
        modelAccess?: IModelAccessResolution
    ): Promise<void> {
        if (modelAccess?.accessSource === ModelAccessSourceEnum.Direct) {
            return
        }
        if (
            !(await this.isMembershipAccessEnabled({
                tenantId: input.tenantId,
                organizationId: input.organizationId
            }))
        ) {
            return
        }
        const access = await this.findModelAccessWithOrganizationSelfHeal({
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            copilotOrganizationId: input.copilotOrganizationId,
            userId: modelAccess?.billableUserId ?? input.userId,
            xpertId: modelAccess ? undefined : input.xpertId
        })
        if (!access) {
            throw new ExceedingLimitException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPlanRequired',
                    'Membership plan is required to use Copilot models.'
                )
            )
        }
        if (modelAccess?.accessSource !== ModelAccessSourceEnum.Grant) {
            this.assertCopilotScopeMatches(access, input.copilotOrganizationId)
            this.assertModelAllowed(access.membership.plan, input.provider, input.model)
        }

        const pointsRemaining = this.pointsRemaining(access.membership)
        if (pointsRemaining !== null && pointsRemaining <= 0) {
            const personalPointsBalance = await this.getPersonalPointsBalance(input.tenantId, access.membership.userId)
            if (personalPointsBalance <= 0) {
                throw new ExceedingLimitException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPointsLimitExceeded',
                        'Membership points limit exceeded.'
                    )
                )
            }
        }
        await this.assertRateLimits(
            access.membership,
            modelAccess?.accessSource === ModelAccessSourceEnum.Grant ? undefined : input.provider,
            modelAccess?.accessSource === ModelAccessSourceEnum.Grant ? undefined : input.model
        )
    }

    async recordUsage(input: RecordUsageInput): Promise<MembershipPointLedger | null> {
        const tokenUsed = Math.max(0, Math.trunc(input.tokenUsed ?? 0))
        if (!tokenUsed) {
            return null
        }
        if (input.modelAccess?.accessSource === ModelAccessSourceEnum.Direct) {
            return null
        }
        if (
            !(await this.isMembershipAccessEnabled({
                tenantId: input.tenantId,
                organizationId: input.organizationId
            }))
        ) {
            return null
        }
        const tokensPerPoint = await this.resolveTenantTokensPerPoint(input.tenantId)

        let exceeded = false
        const ledger = await this.dataSource.transaction(async (manager) => {
            const access = await this.findModelAccessWithOrganizationSelfHeal(
                {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    copilotOrganizationId: input.copilotOrganizationId,
                    userId: input.modelAccess?.billableUserId ?? input.userId,
                    xpertId: input.modelAccess ? undefined : input.xpertId
                },
                manager,
                true
            )
            if (!access) {
                throw new ExceedingLimitException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPlanRequired',
                        'Membership plan is required to use Copilot models.'
                    )
                )
            }
            if (input.modelAccess?.accessSource !== ModelAccessSourceEnum.Grant) {
                this.assertCopilotScopeMatches(access, input.copilotOrganizationId)
                this.assertModelAllowed(access.membership.plan, input.provider, input.model)
            }

            const { membership, organizationId } = access
            const billableUserId = membership.userId
            const pointsUsed = input.modelAccess
                ? this.calculatePointsWithMultiplier(tokenUsed, input.modelAccess.multiplier, tokensPerPoint)
                : this.calculatePoints(tokenUsed, membership.plan, input.provider, input.model, tokensPerPoint)
            const accessSource = input.modelAccess?.accessSource ?? ModelAccessSourceEnum.Plan
            const modelGrantId = input.modelAccess?.grantId ?? null
            if (access.personalPointsOnly) {
                const personalPointsBalance = await this.getPersonalPointsBalance(
                    input.tenantId,
                    billableUserId,
                    manager
                )
                const personalPointsUsed = Math.min(pointsUsed, personalPointsBalance)
                exceeded = personalPointsUsed < pointsUsed
                return this.createLedger(manager, {
                    tenantId: input.tenantId,
                    userId: billableUserId,
                    membershipId: null,
                    planId: membership.planId,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: -personalPointsUsed,
                    tokenUsed,
                    provider: input.provider,
                    model: input.model,
                    organizationId,
                    runtimeOrganizationId: input.organizationId,
                    xpertId: input.xpertId,
                    threadId: input.threadId,
                    copilotId: input.copilotId,
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                    accessSource,
                    modelGrantId
                })
            }
            const membershipPointsRemaining = this.pointsRemaining(membership)
            const membershipPointsUsed =
                membershipPointsRemaining === null ? pointsUsed : Math.min(pointsUsed, membershipPointsRemaining)
            let personalPointsUsed = pointsUsed - membershipPointsUsed

            if (personalPointsUsed > 0) {
                await this.acquirePersonalPointsLock(manager, input.tenantId, billableUserId)
                const personalPointsBalance = await this.getPersonalPointsBalance(
                    input.tenantId,
                    billableUserId,
                    manager
                )
                personalPointsUsed = Math.min(personalPointsUsed, personalPointsBalance)
                exceeded = membershipPointsUsed + personalPointsUsed < pointsUsed
            }

            membership.pointsUsed = (membership.pointsUsed ?? 0) + membershipPointsUsed
            const saved = await manager.getRepository(UserMembership).save(membership)
            await this.synchronizeCurrentPeriodProjection(this.hydrateMembershipPlanSnapshot(saved), manager)
            const ledger = await this.createLedger(manager, {
                tenantId: input.tenantId,
                userId: billableUserId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Usage,
                pointsDelta: -membershipPointsUsed,
                tokenUsed,
                provider: input.provider,
                model: input.model,
                organizationId,
                runtimeOrganizationId: input.organizationId,
                xpertId: input.xpertId,
                threadId: input.threadId,
                copilotId: input.copilotId,
                usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                accessSource,
                modelGrantId
            })

            if (personalPointsUsed > 0) {
                await this.createLedger(manager, {
                    tenantId: input.tenantId,
                    userId: billableUserId,
                    membershipId: null,
                    planId: null,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: -personalPointsUsed,
                    tokenUsed: 0,
                    provider: input.provider,
                    model: input.model,
                    organizationId,
                    runtimeOrganizationId: input.organizationId,
                    xpertId: input.xpertId,
                    threadId: input.threadId,
                    copilotId: input.copilotId,
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                    accessSource,
                    modelGrantId
                })
            }

            if (saved.pointsGranted !== null && saved.pointsUsed > saved.pointsGranted) {
                exceeded = true
            }

            return ledger
        })

        if (exceeded) {
            throw new ExceedingLimitException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPointsLimitExceeded',
                    'Membership points limit exceeded.'
                )
            )
        }

        return ledger
    }

    async recordGatewayUsage(input: RecordGatewayUsageInput): Promise<RecordGatewayUsageResult> {
        const tokenUsed = Math.max(0, Math.trunc(input.tokenUsed ?? 0))
        if (!tokenUsed) {
            return { chargedPoints: 0, excessPoints: 0, ledger: null }
        }
        const sourceReference = `model-gateway:${input.gatewayRequestId}`
        const tokensPerPoint = await this.resolveTenantTokensPerPoint(input.tenantId)

        return this.dataSource.transaction(async (manager) => {
            await this.acquireGatewayRequestLock(manager, input.tenantId, input.gatewayRequestId)
            const existing = await manager.getRepository(MembershipPointLedger).find({
                where: {
                    tenantId: input.tenantId,
                    gatewayRequestId: input.gatewayRequestId
                },
                order: { createdAt: 'ASC' }
            })
            if (existing.length) {
                const chargedPoints = existing.reduce(
                    (total, item) =>
                        total +
                        Math.max(
                            0,
                            Number(
                                item.chargedPoints === null || item.chargedPoints === undefined
                                    ? -item.pointsDelta
                                    : item.chargedPoints
                            )
                        ),
                    0
                )
                return {
                    chargedPoints,
                    excessPoints: Math.max(...existing.map((item) => Number(item.excessPoints ?? 0)), 0),
                    ledger: existing[0]
                }
            }

            const access = await this.findModelAccessWithOrganizationSelfHeal(
                {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    copilotOrganizationId: input.copilotOrganizationId,
                    userId: input.modelAccess.billableUserId,
                    xpertId: undefined
                },
                manager,
                true
            )
            const pointsUsed = this.calculatePointsWithMultiplier(
                tokenUsed,
                input.modelAccess.multiplier,
                tokensPerPoint
            )
            if (!access) {
                const ledger = await this.createLedger(manager, {
                    tenantId: input.tenantId,
                    userId: input.modelAccess.billableUserId,
                    membershipId: null,
                    planId: null,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: 0,
                    tokenUsed,
                    provider: input.provider,
                    model: input.model,
                    organizationId: null,
                    runtimeOrganizationId: null,
                    copilotId: input.copilotId,
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                    sourceReference,
                    accessSource: ModelAccessSourceEnum.Grant,
                    modelGrantId: input.modelAccess.grantId,
                    usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                    gatewayRequestId: input.gatewayRequestId,
                    gatewayApiKeyId: input.gatewayApiKeyId,
                    chargedPoints: 0,
                    excessPoints: pointsUsed
                })
                return { chargedPoints: 0, excessPoints: pointsUsed, ledger }
            }

            const { membership, organizationId } = access
            const billableUserId = membership.userId
            let membershipPointsUsed = 0
            let personalPointsUsed = 0

            if (access.personalPointsOnly) {
                await this.acquirePersonalPointsLock(manager, input.tenantId, billableUserId)
                const personalBalance = await this.getPersonalPointsBalance(input.tenantId, billableUserId, manager)
                personalPointsUsed = Math.min(pointsUsed, personalBalance)
            } else {
                const membershipPointsRemaining = this.pointsRemaining(membership)
                membershipPointsUsed =
                    membershipPointsRemaining === null ? pointsUsed : Math.min(pointsUsed, membershipPointsRemaining)
                const remaining = pointsUsed - membershipPointsUsed
                if (remaining > 0) {
                    await this.acquirePersonalPointsLock(manager, input.tenantId, billableUserId)
                    const personalBalance = await this.getPersonalPointsBalance(input.tenantId, billableUserId, manager)
                    personalPointsUsed = Math.min(remaining, personalBalance)
                }
                membership.pointsUsed = (membership.pointsUsed ?? 0) + membershipPointsUsed
                const saved = await manager.getRepository(UserMembership).save(membership)
                await this.synchronizeCurrentPeriodProjection(this.hydrateMembershipPlanSnapshot(saved), manager)
            }

            const chargedPoints = membershipPointsUsed + personalPointsUsed
            const excessPoints = Math.max(0, pointsUsed - chargedPoints)
            const common = {
                tenantId: input.tenantId,
                userId: billableUserId,
                provider: input.provider,
                model: input.model,
                organizationId,
                runtimeOrganizationId: null,
                copilotId: input.copilotId,
                usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                accessSource: ModelAccessSourceEnum.Grant,
                modelGrantId: input.modelAccess.grantId,
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                gatewayRequestId: input.gatewayRequestId,
                gatewayApiKeyId: input.gatewayApiKeyId,
                excessPoints
            }
            const ledger = await this.createLedger(manager, {
                ...common,
                membershipId: access.personalPointsOnly ? null : membership.id,
                planId: membership.planId,
                source: access.personalPointsOnly
                    ? MembershipLedgerSourceEnum.PersonalUsage
                    : MembershipLedgerSourceEnum.Usage,
                pointsDelta: -(access.personalPointsOnly ? personalPointsUsed : membershipPointsUsed),
                tokenUsed,
                chargedPoints: access.personalPointsOnly ? personalPointsUsed : membershipPointsUsed,
                sourceReference
            })
            if (personalPointsUsed > 0 && !access.personalPointsOnly) {
                await this.createLedger(manager, {
                    ...common,
                    membershipId: null,
                    planId: null,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: -personalPointsUsed,
                    tokenUsed: 0,
                    chargedPoints: personalPointsUsed,
                    excessPoints: 0,
                    sourceReference: `${sourceReference}:personal`
                })
            }
            return { chargedPoints, excessPoints, ledger }
        })
    }

    async resolveBillableUserId(input: BillableUserInput, manager?: EntityManager): Promise<string> {
        const xpertId = input.xpertId?.trim()
        if (!xpertId) {
            return input.userId
        }

        const repository = manager?.getRepository(Xpert) ?? this.xpertRepository
        const xpert = await repository.findOne({
            where: {
                tenantId: input.tenantId,
                id: xpertId
            },
            select: {
                id: true,
                createdById: true
            }
        })

        const creatorId = xpert?.createdById?.trim()
        if (!creatorId) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.XpertCreatorRequiredForBilling',
                    'The Xpert creator is required before model access and usage can be billed.'
                )
            )
        }

        return creatorId
    }

    calculatePoints(
        tokenUsed: number,
        plan: MembershipPlan,
        provider?: string,
        model?: string,
        tokensPerPoint = DEFAULT_MEMBERSHIP_TOKENS_PER_POINT
    ): number {
        const multiplier = this.resolveModelMultiplier(plan, provider, model)
        return this.calculatePointsWithMultiplier(tokenUsed, multiplier, tokensPerPoint)
    }

    calculatePointsWithMultiplier(
        tokenUsed: number,
        multiplier: number,
        tokensPerPoint = DEFAULT_MEMBERSHIP_TOKENS_PER_POINT
    ): number {
        return Number(((tokenUsed / tokensPerPoint) * Math.max(0, multiplier)).toFixed(10))
    }

    resolveModelMultiplierForPlan(plan: Pick<IMembershipPlan, 'modelMultipliers'>, provider?: string, model?: string) {
        return this.resolveModelMultiplier(plan, provider, model)
    }

    async hasConsumableBalance(access: MembershipModelAccess): Promise<boolean> {
        const pointsRemaining = this.pointsRemaining(access.membership)
        if (pointsRemaining === null || pointsRemaining > 0) {
            return true
        }
        return (await this.getPersonalPointsBalance(access.tenantId, access.membership.userId)) > 0
    }

    isModelAllowed(plan: Pick<IMembershipPlan, 'allowedModels'>, provider?: string, model?: string): boolean {
        const allowedModels = plan.allowedModels ?? []
        if (!allowedModels.length) {
            return true
        }

        const providerName = provider?.trim()
        const modelName = model?.trim()
        if (!providerName || !modelName) {
            return false
        }

        return allowedModels.some(
            (rule) =>
                (rule.provider === '*' || rule.provider === providerName) &&
                (rule.model === '*' || rule.model === modelName)
        )
    }

    async findModelAccess(
        input?: {
            tenantId?: string | null
            organizationId?: string | null
            userId?: string | null
            xpertId?: string | null
        },
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipModelAccess | null> {
        const tenantId = input?.tenantId ?? this.requireTenant()
        const organizationId = this.normalizeScopeOrganizationId(input?.organizationId)
        const organizationMembershipEnabled = organizationId
            ? await this.isMembershipPlanEnabledForScope({ tenantId, organizationId }, manager)
            : false
        const tenantMembershipEnabled = await this.isMembershipPlanEnabledForScope(
            { tenantId, organizationId: null },
            manager
        )
        if (!organizationMembershipEnabled && !tenantMembershipEnabled) {
            return null
        }
        const userId = input?.userId ?? this.requireUser()
        const billableUserId = await this.resolveBillableUserId(
            {
                tenantId,
                userId,
                xpertId: input?.xpertId ?? undefined
            },
            manager
        )
        if (organizationId && organizationMembershipEnabled) {
            const membership = await this.findUsableMembership(
                tenantId,
                organizationId,
                billableUserId,
                manager,
                forUpdate
            )
            if (membership) {
                return {
                    tenantId,
                    organizationId,
                    membership
                }
            }

            if (await this.hasActivePlan(tenantId, organizationId, manager)) {
                return this.findPersonalPointsAccess(tenantId, organizationId, billableUserId, manager, forUpdate)
            }
        }

        if (!tenantMembershipEnabled) {
            return null
        }

        const tenantMembership = await this.findUsableMembership(tenantId, null, billableUserId, manager, forUpdate)
        if (tenantMembership) {
            return {
                tenantId,
                organizationId: null,
                membership: tenantMembership
            }
        }

        return this.findPersonalPointsAccess(tenantId, null, billableUserId, manager, forUpdate)
    }

    private async findPersonalPointsAccess(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipModelAccess | null> {
        if (forUpdate && manager) {
            await this.acquirePersonalPointsLock(manager, tenantId, userId)
        }
        if ((await this.getPersonalPointsBalance(tenantId, userId, manager)) <= 0) {
            return null
        }

        const plan = await this.findDefaultPlan(tenantId, organizationId, manager)
        const previousMembership = await this.findMembershipForUpdate(
            tenantId,
            organizationId,
            userId,
            undefined,
            manager
        )
        if (!plan) {
            return null
        }

        const fallbackMembership =
            previousMembership ??
            ((manager?.getRepository(UserMembership) ?? this.membershipRepository).create({
                tenantId,
                organizationId,
                userId,
                planId: plan.id,
                plan,
                status: MembershipStatusEnum.Expired,
                source: organizationId ? MembershipSourceEnum.Organization : MembershipSourceEnum.TenantDefault,
                renewalMode: MembershipRenewalModeEnum.Manual,
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(),
                pointsGranted: 0,
                pointsUsed: 0,
                pointsTotalUsed: 0
            }) as MembershipWithPlan)
        const { start, end } = this.resolveFallbackPeriod(fallbackMembership, plan.period)
        return {
            tenantId,
            organizationId,
            personalPointsOnly: true,
            persistedMembership: previousMembership ?? undefined,
            membership: {
                ...fallbackMembership,
                plan,
                planId: plan.id,
                source: organizationId ? MembershipSourceEnum.Organization : MembershipSourceEnum.TenantDefault,
                renewalMode: MembershipRenewalModeEnum.Auto,
                currentPeriodStart: start,
                currentPeriodEnd: end,
                pointsGranted: 0,
                pointsUsed: 0
            }
        }
    }

    private async findMembershipPresentationAccess(
        tenantId: string,
        organizationId: string | null,
        userId: string
    ): Promise<MembershipModelAccess | null> {
        const access = await this.findModelAccess({ tenantId, organizationId, userId })
        if (access) {
            return access
        }

        const organizationMembershipEnabled = organizationId
            ? await this.isMembershipPlanEnabledForScope({ tenantId, organizationId })
            : false
        if (organizationId && organizationMembershipEnabled) {
            const organizationMembership = await this.findMembershipForUpdate(
                tenantId,
                organizationId,
                userId,
                undefined
            )
            const organizationPlan =
                organizationMembership?.plan ?? (await this.findDefaultPlan(tenantId, organizationId))
            if (organizationMembership && organizationPlan) {
                return this.toPresentationAccess(organizationMembership, organizationPlan, organizationId)
            }
            if (await this.hasActivePlan(tenantId, organizationId)) {
                return null
            }
        }

        if (!(await this.isMembershipPlanEnabledForScope({ tenantId, organizationId: null }))) {
            return null
        }
        const tenantMembership = await this.findMembershipForUpdate(tenantId, null, userId, undefined)
        const tenantPlan = tenantMembership?.plan ?? (await this.findDefaultPlan(tenantId, null))
        return tenantMembership && tenantPlan ? this.toPresentationAccess(tenantMembership, tenantPlan, null) : null
    }

    private toPresentationAccess(
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

    private resolveFallbackPeriod(membership: MembershipWithPlan, period: MembershipPeriodEnum) {
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

    private async findModelAccessWithOrganizationSelfHeal(
        input: {
            tenantId: string
            organizationId?: string | null
            copilotOrganizationId?: string | null
            userId: string
            xpertId?: string | null
        },
        manager?: EntityManager,
        forUpdate = false
    ) {
        let access = await this.findModelAccess(input, manager, forUpdate)
        if (!this.shouldSelfHealOrganizationAccess(input.organizationId, input.copilotOrganizationId)) {
            return access
        }
        if (access?.organizationId === this.normalizeScopeOrganizationId(input.copilotOrganizationId)) {
            return access
        }

        await this.ensureScopeInitialized(
            {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                assignedById: input.userId
            },
            manager
        )
        access = await this.findModelAccess(input, manager, forUpdate)
        return access
    }

    private shouldSelfHealOrganizationAccess(organizationId?: string | null, copilotOrganizationId?: string | null) {
        const normalizedOrganizationId = this.normalizeScopeOrganizationId(organizationId)
        return (
            !!normalizedOrganizationId &&
            normalizedOrganizationId === this.normalizeScopeOrganizationId(copilotOrganizationId)
        )
    }

    private async buildScopeStatus(scope: MembershipScope, manager?: EntityManager): Promise<IMembershipScopeStatus> {
        const planRepository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        const [plans, defaultPlan] = await Promise.all([
            planRepository.find({
                where: {
                    ...this.scopeWhere(scope.tenantId, scope.organizationId),
                    catalogSourcePlanId: IsNull()
                },
                order: { isDefault: 'DESC', createdAt: 'ASC' }
            }),
            this.findDefaultPlan(scope.tenantId, scope.organizationId, manager)
        ])
        const activePlanCount = plans.filter((plan) => plan.status === MembershipPlanStatusEnum.Active).length
        const isOrganizationScope = !!scope.organizationId
        const activeUserIds = isOrganizationScope
            ? await this.findActiveOrganizationUserIds(scope.tenantId, scope.organizationId, manager)
            : []
        const assignedMemberCount = isOrganizationScope
            ? await this.countAssignedOrganizationMemberships(scope, activeUserIds, manager)
            : null
        const localCopilotCount = isOrganizationScope
            ? await this.countEnabledOrganizationCopilots(scope.tenantId, scope.organizationId, manager)
            : null
        const hasDefaultPlan = !!defaultPlan
        const initialized = isOrganizationScope
            ? !activePlanCount || (hasDefaultPlan && assignedMemberCount === activeUserIds.length)
            : activePlanCount > 0

        return {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            scope: isOrganizationScope ? 'organization' : 'tenant',
            planCount: plans.length,
            activePlanCount,
            defaultPlan,
            initialized,
            needsRepair: isOrganizationScope
                ? !!activePlanCount && (!hasDefaultPlan || assignedMemberCount !== activeUserIds.length)
                : false,
            activeMemberCount: isOrganizationScope ? activeUserIds.length : null,
            assignedMemberCount,
            localCopilotCount
        }
    }

    private async ensureDefaultOrganizationPlan(
        scope: MembershipScope & { organizationId: string },
        manager: EntityManager
    ): Promise<MembershipPlan | null> {
        await this.acquireOrganizationDefaultPlanInitializationLock(manager, scope.tenantId, scope.organizationId)
        const repository = manager.getRepository(MembershipPlan)
        const tokensPerPoint = await this.resolveTenantTokensPerPoint(scope.tenantId)
        const existingDefaultPlan = await this.findDefaultPlan(scope.tenantId, scope.organizationId, manager)
        if (existingDefaultPlan) {
            return existingDefaultPlan
        }

        const activePlan = await repository.findOne({
            where: {
                ...this.scopeWhere(scope.tenantId, scope.organizationId),
                status: MembershipPlanStatusEnum.Active,
                catalogSourcePlanId: IsNull()
            },
            order: { createdAt: 'ASC' }
        })
        if (activePlan) {
            await this.clearDefaultPlan(scope.tenantId, scope.organizationId, manager, activePlan.id)
            activePlan.isDefault = true
            return repository.save(activePlan)
        }

        const archivedDefaultPlan = await repository.findOne({
            where: {
                ...this.scopeWhere(scope.tenantId, scope.organizationId),
                code: 'default',
                catalogSourcePlanId: IsNull()
            }
        })
        if (archivedDefaultPlan) {
            await this.clearDefaultPlan(scope.tenantId, scope.organizationId, manager, archivedDefaultPlan.id)
            archivedDefaultPlan.status = MembershipPlanStatusEnum.Active
            archivedDefaultPlan.isDefault = true
            return repository.save(archivedDefaultPlan)
        }

        const plan = repository.create({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            code: 'default',
            name: DEFAULT_PLAN_NAME,
            level: 0,
            status: MembershipPlanStatusEnum.Active,
            isDefault: true,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: DEFAULT_INCLUDED_POINTS,
            tokensPerPoint,
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        })
        await this.clearDefaultPlan(scope.tenantId, scope.organizationId, manager)
        return repository.save(plan)
    }

    private async ensureOrganizationMemberMemberships(
        scope: MembershipScope,
        plan: MembershipPlan,
        assignedById: string | null,
        manager: EntityManager
    ) {
        if (!scope.organizationId) {
            return
        }

        const userIds = await this.findActiveOrganizationUserIds(scope.tenantId, scope.organizationId, manager)
        if (!userIds.length) {
            return
        }

        const start = new Date()
        for (const userId of userIds) {
            await this.ensureOrganizationMemberMembershipWithPlan(
                {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    userId
                },
                plan,
                assignedById,
                manager,
                start
            )
        }
    }

    private async ensureOrganizationMemberMembershipWithPlan(
        input: {
            tenantId: string
            organizationId: string
            userId: string
        },
        plan: MembershipPlan,
        assignedById: string | null,
        manager: EntityManager,
        start = new Date()
    ): Promise<{
        membership: UserMembership | null
        created: boolean
    }> {
        await this.acquireMembershipAssignmentLock(manager, input.tenantId, input.organizationId, input.userId)
        const existingMembership = await this.findMembershipForUpdate(
            input.tenantId,
            input.organizationId,
            input.userId,
            [MembershipStatusEnum.Active, MembershipStatusEnum.Paused],
            manager
        )
        if (existingMembership) {
            return {
                membership: existingMembership.status === MembershipStatusEnum.Active ? existingMembership : null,
                created: false
            }
        }

        const repository = manager.getRepository(UserMembership)
        const membership = await repository.save(
            repository.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                userId: input.userId,
                planId: plan.id,
                status: MembershipStatusEnum.Active,
                source: MembershipSourceEnum.Organization,
                renewalMode: MembershipRenewalModeEnum.Auto,
                currentPeriodStart: start,
                currentPeriodEnd: periodEndFor(start, plan.period),
                pointsGranted: plan.includedPoints,
                pointsUsed: 0,
                pointsTotalUsed: 0,
                assignedById: assignedById ?? undefined,
                note: DEFAULT_ORGANIZATION_PLAN_GRANT_REASON
            })
        )
        membership.plan = plan
        await this.ensureCurrentPeriodRecord(this.hydrateMembershipPlanSnapshot(membership), manager)
        await this.createLedger(manager, {
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            userId: input.userId,
            membershipId: membership.id,
            planId: plan.id,
            source: MembershipLedgerSourceEnum.Assignment,
            pointsDelta: plan.includedPoints ?? 0,
            reason: DEFAULT_ORGANIZATION_PLAN_GRANT_REASON
        })
        return {
            membership,
            created: true
        }
    }

    private async findDefaultPlan(
        tenantId: string,
        organizationId: string | null,
        manager?: EntityManager
    ): Promise<MembershipPlan | null> {
        const repository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        return repository.findOne({
            where: {
                ...this.scopeWhere(tenantId, organizationId),
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                catalogSourcePlanId: IsNull()
            }
        })
    }

    private async hasActivePlan(tenantId: string, organizationId: string | null, manager?: EntityManager) {
        const repository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        if (!repository?.count) {
            return false
        }
        return (
            (await repository.count({
                where: {
                    ...this.scopeWhere(tenantId, organizationId),
                    status: MembershipPlanStatusEnum.Active,
                    catalogSourcePlanId: IsNull()
                }
            })) > 0
        )
    }

    private async findActiveOrganizationUserIds(
        tenantId: string,
        organizationId: string,
        manager?: EntityManager
    ): Promise<string[]> {
        const repository = manager?.getRepository(UserOrganization) ?? this.userOrganizationRepository
        if (!repository?.find) {
            return []
        }
        const memberships = await repository.find({
            select: ['userId'],
            where: {
                tenantId,
                organizationId,
                isActive: true
            }
        })
        const userIds = Array.from(new Set(memberships.map((membership) => membership.userId).filter(Boolean)))
        if (!userIds.length) {
            return []
        }

        const users = await this.userRepository.find({
            select: ['id'],
            where: {
                tenantId,
                id: In(userIds),
                type: UserType.USER
            }
        })
        return users.map((user) => user.id)
    }

    private async isMembershipEligibleUser(tenantId: string, userId: string) {
        return !!(await this.userRepository.findOne({
            select: ['id'],
            where: {
                id: userId,
                tenantId,
                type: UserType.USER
            }
        }))
    }

    private async assertMembershipEligibleUser(tenantId: string, userId: string) {
        if (await this.isMembershipEligibleUser(tenantId, userId)) {
            return
        }

        throw new BadRequestException(
            this.translateMembershipError(
                'server-ai:Error.MembershipTechnicalUserNotAllowed',
                'Technical users cannot have membership plans.'
            )
        )
    }

    async isActiveOrganizationMember(tenantId: string, organizationId: string, userId: string): Promise<boolean> {
        const membership = await this.userOrganizationRepository?.findOne({
            select: ['id'],
            where: {
                tenantId,
                organizationId,
                userId,
                isActive: true
            }
        })
        return !!membership
    }

    private async assertActiveOrganizationMember(
        tenantId: string,
        organizationId: string,
        userId: string,
        manager?: EntityManager
    ) {
        const repository = manager?.getRepository(UserOrganization) ?? this.userOrganizationRepository
        const membership = await repository?.findOne({
            select: ['id'],
            where: {
                tenantId,
                organizationId,
                userId,
                isActive: true
            }
        })
        if (membership) {
            return
        }

        throw new BadRequestException(
            this.translateMembershipError(
                'server-ai:Error.MembershipOrganizationMemberRequired',
                'The user is not an active member of the current organization.'
            )
        )
    }

    private async countAssignedOrganizationMemberships(
        scope: MembershipScope,
        userIds: string[],
        manager?: EntityManager
    ) {
        if (!scope.organizationId || !userIds.length) {
            return 0
        }
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const memberships = await repository.find({
            select: ['userId'],
            where: {
                ...this.scopeWhere(scope.tenantId, scope.organizationId),
                userId: In(userIds)
            }
        })
        return new Set(memberships.map((membership) => membership.userId)).size
    }

    async countEnabledOrganizationCopilots(tenantId: string, organizationId: string | null, manager?: EntityManager) {
        if (!organizationId) {
            return 0
        }
        const repository = manager?.getRepository(Copilot) ?? this.copilotRepository
        if (!repository?.count) {
            return 0
        }
        return repository.count({
            where: {
                tenantId,
                organizationId,
                enabled: true
            }
        })
    }

    private async isMembershipPlanEnabledForScope(scope: MembershipScope, manager?: EntityManager): Promise<boolean> {
        const organizationToggle = scope.organizationId
            ? await this.findMembershipPlanFeatureToggle(scope, scope.organizationId, manager)
            : null
        if (organizationToggle) {
            return organizationToggle.isEnabled === true
        }

        const tenantToggle = await this.findMembershipPlanFeatureToggle(scope, null, manager)
        return tenantToggle?.isEnabled === true
    }

    private async findMembershipPlanFeatureToggle(
        scope: MembershipScope,
        organizationId: string | null,
        manager?: EntityManager
    ): Promise<FeatureOrganization | null> {
        const managerRepository = manager?.getRepository(FeatureOrganization)
        const repository = managerRepository?.createQueryBuilder
            ? managerRepository
            : this.featureOrganizationRepository
        if (!repository?.createQueryBuilder) {
            return null
        }

        const qb = repository
            .createQueryBuilder('featureOrganization')
            .leftJoinAndSelect('featureOrganization.feature', 'feature')
            .where('featureOrganization.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('feature.code = :code', { code: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN })

        this.applyScopeFilter(qb, 'featureOrganization.organizationId', organizationId)

        const toggles = await qb.getMany()
        return toggles.find((toggle) => !!toggle.feature?.parentId) ?? toggles[0] ?? null
    }

    private async assertMembershipPlanFeatureEnabled(scope: MembershipScope, manager?: EntityManager) {
        if (await this.isMembershipPlanEnabledForScope(scope, manager)) {
            return
        }

        throw new ForbiddenException(
            this.translateMembershipError(
                'server-ai:Error.MembershipPlanFeatureDisabled',
                'Membership plan feature is disabled.'
            )
        )
    }

    private async requireActiveMembership(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipWithPlan> {
        const membership = await this.findUsableMembership(tenantId, organizationId, userId, manager, forUpdate)
        if (!membership) {
            throw new BadRequestException('Membership not found.')
        }
        return membership
    }

    private async appendMembershipPeriodsInTransaction(
        input: TMembershipPeriodsAppendInput,
        manager: EntityManager
    ): Promise<MembershipPeriod[]> {
        if (!Number.isInteger(input.count) || input.count < 1 || input.count > 120) {
            throw new BadRequestException('Membership period count must be an integer between 1 and 120.')
        }

        const organizationId = this.normalizeScopeOrganizationId(input.organizationId)
        const sourceReference = input.sourceReference?.trim() || null
        const source = input.source ?? MembershipSourceEnum.External
        if (source === MembershipSourceEnum.External && !sourceReference) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.ExternalMembershipPeriodReferenceRequired',
                    'Externally managed membership periods require a source reference.'
                )
            )
        }
        await this.assertMembershipEligibleUser(input.tenantId, input.userId)
        if (organizationId) {
            await this.assertActiveOrganizationMember(input.tenantId, organizationId, input.userId, manager)
        }
        await this.acquireMembershipAssignmentLock(manager, input.tenantId, organizationId, input.userId)

        const periodRepository = manager.getRepository(MembershipPeriod)
        if (sourceReference) {
            const existing = await periodRepository.find({
                where: {
                    tenantId: input.tenantId,
                    sourceReference
                },
                order: { sourceSequence: 'ASC' }
            })
            if (existing.length) {
                if (
                    existing[0].userId !== input.userId ||
                    (existing[0].organizationId ?? null) !== organizationId ||
                    existing[0].planSnapshot.planId !== input.planId ||
                    existing.length !== input.count
                ) {
                    throw new BadRequestException('Membership period request does not match the existing fulfillment.')
                }
                return existing
            }
        }

        const plan = await this.resolvePeriodPlan(
            input.tenantId,
            organizationId,
            input.planId,
            input.planSnapshot,
            manager
        )
        const snapshot = input.planSnapshot
            ? this.copyPlanSnapshot(input.planSnapshot, input.planId)
            : this.createPlanSnapshot(plan)
        let membership = await this.findMembershipForUpdate(
            input.tenantId,
            organizationId,
            input.userId,
            undefined,
            manager
        )
        const now = new Date()
        const hasLiveCurrentPeriod =
            !!membership &&
            [MembershipStatusEnum.Active, MembershipStatusEnum.Paused].includes(membership.status) &&
            new Date(membership.currentPeriodEnd).getTime() > now.getTime()

        if (membership && hasLiveCurrentPeriod) {
            membership = this.hydrateMembershipPlanSnapshot(membership)
            await this.ensureCurrentPeriodRecord(membership, manager)
        } else if (membership) {
            const stalePeriod = await periodRepository.findOne({
                where: {
                    tenantId: input.tenantId,
                    membershipId: membership.id,
                    status: MembershipPeriodStatusEnum.Active
                }
            })
            if (stalePeriod) {
                stalePeriod.status = MembershipPeriodStatusEnum.Completed
                stalePeriod.pointsUsed = membership.pointsUsed ?? 0
                await periodRepository.save(stalePeriod)
            }
        }

        const lastPeriod = membership
            ? await periodRepository.findOne({
                  where: {
                      tenantId: input.tenantId,
                      membershipId: membership.id,
                      status: In([MembershipPeriodStatusEnum.Active, MembershipPeriodStatusEnum.Scheduled])
                  },
                  order: { periodEnd: 'DESC' }
              })
            : null
        const requestedStart = input.startAt ? new Date(input.startAt) : now
        if (Number.isNaN(requestedStart.getTime())) {
            throw new BadRequestException('Membership period start is invalid.')
        }

        const currentEnd = membership ? new Date(membership.currentPeriodEnd) : null
        const startAt = lastPeriod?.periodEnd ?? (hasLiveCurrentPeriod ? currentEnd : requestedStart)
        if (!hasLiveCurrentPeriod && !lastPeriod && startAt.getTime() > now.getTime()) {
            throw new BadRequestException('The first membership period must start immediately.')
        }

        const membershipRepository = manager.getRepository(UserMembership)
        if (!membership) {
            const firstEnd = periodEndFor(startAt, snapshot.period)
            membership = membershipRepository.create({
                tenantId: input.tenantId,
                organizationId,
                userId: input.userId,
                planId: plan.id,
                plan,
                planSnapshot: snapshot,
                status: MembershipStatusEnum.Active,
                source: input.source ?? MembershipSourceEnum.External,
                renewalMode: input.renewalMode ?? MembershipRenewalModeEnum.Manual,
                currentPeriodStart: startAt,
                currentPeriodEnd: firstEnd,
                pointsGranted: snapshot.includedPoints,
                pointsUsed: 0,
                pointsTotalUsed: 0
            }) as MembershipWithPlan
            membership = (await membershipRepository.save(membership)) as MembershipWithPlan
            membership.plan = plan
        }

        const renewalMode = input.renewalMode ?? MembershipRenewalModeEnum.Manual
        const startsImmediately = !lastPeriod && !hasLiveCurrentPeriod
        const periods: MembershipPeriod[] = []
        let periodStart = startAt

        for (let sequence = 0; sequence < input.count; sequence += 1) {
            const periodEnd = periodEndFor(periodStart, snapshot.period)
            const status =
                startsImmediately && sequence === 0
                    ? MembershipPeriodStatusEnum.Active
                    : MembershipPeriodStatusEnum.Scheduled
            const period = await periodRepository.save(
                periodRepository.create({
                    tenantId: input.tenantId,
                    organizationId,
                    membershipId: membership.id,
                    userId: input.userId,
                    planId: plan.id,
                    status,
                    periodStart,
                    periodEnd,
                    pointsGranted: snapshot.includedPoints,
                    pointsUsed: 0,
                    source,
                    renewalMode,
                    sourceReference,
                    sourceSequence: sequence,
                    planSnapshot: snapshot
                })
            )
            periods.push(period)
            periodStart = periodEnd
        }

        if (startsImmediately) {
            membership.pointsTotalUsed = (membership.pointsTotalUsed ?? 0) + (membership.pointsUsed ?? 0)
            membership.planId = plan.id
            membership.plan = plan
            membership.planSnapshot = snapshot
            membership.status = MembershipStatusEnum.Active
            membership.source = source
            membership.renewalMode = renewalMode
            membership.currentPeriodStart = periods[0].periodStart
            membership.currentPeriodEnd = periods[0].periodEnd
            membership.pointsGranted = periods[0].pointsGranted
            membership.pointsUsed = 0
            await membershipRepository.save(membership)
            await this.createLedger(manager, {
                tenantId: input.tenantId,
                organizationId,
                userId: input.userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Assignment,
                actorId: input.actorId,
                pointsDelta: periods[0].pointsGranted ?? 0,
                reason: 'Membership period activated'
            })
        }
        if (periods.some(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)) {
            await this.createLedger(manager, {
                tenantId: input.tenantId,
                organizationId,
                userId: input.userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Renew,
                actorId: input.actorId,
                pointsDelta: 0,
                reason: `${input.count} membership period${input.count === 1 ? '' : 's'} scheduled`
            })
        }

        return periods
    }

    private async findMembershipPeriods(
        tenantId: string,
        organizationId: string | null | undefined,
        userId: string
    ): Promise<MembershipPeriod[]> {
        const repository = this.requirePeriodRepository()
        return repository.find({
            where: {
                tenantId,
                ...(organizationId === undefined ? {} : this.scopeWhere(tenantId, organizationId)),
                userId
            },
            relations: ['plan'],
            order: { periodStart: 'ASC' }
        })
    }

    private async findUsableMembership(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipWithPlan | null> {
        let membership = forUpdate
            ? await this.findActiveMembershipForUpdate(tenantId, organizationId, userId, manager)
            : await this.findActiveMembership(tenantId, organizationId, userId, manager)

        if (!membership) {
            return null
        }

        membership = this.hydrateMembershipPlanSnapshot(membership)

        if (membership.plan.status !== MembershipPlanStatusEnum.Active) {
            return null
        }

        membership = await this.synchronizePlanAllowanceType(membership, manager)

        if (new Date(membership.currentPeriodEnd).getTime() <= Date.now()) {
            const activated = await this.activateScheduledPeriod(membership, manager)
            if (activated) {
                return activated
            }
            if (membership.renewalMode === MembershipRenewalModeEnum.Manual) {
                membership.status = MembershipStatusEnum.Expired
                await (manager?.getRepository(UserMembership) ?? this.membershipRepository).save(membership)
                await this.createMembershipStatusLedger(manager, membership, 'Manual membership expired')
                return null
            }
            membership = await this.renewMembership(membership, manager)
        }

        return membership
    }

    private async synchronizePlanAllowanceType(
        membership: MembershipWithPlan,
        manager?: EntityManager
    ): Promise<MembershipWithPlan> {
        if (membership.planSnapshot) {
            return membership
        }
        const planIsUnlimited = membership.plan.includedPoints === null
        const membershipIsUnlimited = membership.pointsGranted === null
        if (planIsUnlimited === membershipIsUnlimited) {
            return membership
        }

        membership.pointsGranted = planIsUnlimited ? null : membership.plan.includedPoints
        await (manager?.getRepository(UserMembership) ?? this.membershipRepository).save(membership)
        await this.createLedger(manager, {
            tenantId: membership.tenantId,
            organizationId: membership.organizationId ?? null,
            userId: membership.userId,
            membershipId: membership.id,
            planId: membership.planId,
            source: MembershipLedgerSourceEnum.Adjustment,
            pointsDelta: 0,
            reason: 'Membership plan allowance type synchronized'
        })
        return membership
    }

    private async activateScheduledPeriod(
        membership: MembershipWithPlan,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        if (!this.periodRepository) {
            return null
        }
        const activate = async (currentMembership: MembershipWithPlan, txManager: EntityManager) => {
            const periodRepository = txManager.getRepository(MembershipPeriod)
            const currentPeriod = await this.ensureCurrentPeriodRecord(currentMembership, txManager)
            currentPeriod.status = MembershipPeriodStatusEnum.Completed
            currentPeriod.pointsUsed = currentMembership.pointsUsed ?? 0
            await periodRepository.save(currentPeriod)

            const now = new Date()
            const scheduledPeriods = await periodRepository.find({
                where: {
                    tenantId: membership.tenantId,
                    membershipId: currentMembership.id,
                    status: MembershipPeriodStatusEnum.Scheduled
                },
                order: { periodStart: 'ASC' }
            })

            let nextPeriod: MembershipPeriod | null = null
            for (const period of scheduledPeriods) {
                if (new Date(period.periodEnd).getTime() <= now.getTime()) {
                    period.status = MembershipPeriodStatusEnum.Completed
                    await periodRepository.save(period)
                    continue
                }
                if (new Date(period.periodStart).getTime() <= now.getTime()) {
                    nextPeriod = period
                }
                break
            }
            if (!nextPeriod) {
                return null
            }

            nextPeriod.status = MembershipPeriodStatusEnum.Active
            await periodRepository.save(nextPeriod)

            currentMembership.pointsTotalUsed =
                (currentMembership.pointsTotalUsed ?? 0) + (currentMembership.pointsUsed ?? 0)
            currentMembership.planId = nextPeriod.planId
            currentMembership.planSnapshot = nextPeriod.planSnapshot
            currentMembership.plan = this.planFromSnapshot(
                nextPeriod.planSnapshot,
                currentMembership.tenantId,
                currentMembership.organizationId ?? null
            )
            currentMembership.status = MembershipStatusEnum.Active
            currentMembership.source = nextPeriod.source
            currentMembership.renewalMode = nextPeriod.renewalMode
            currentMembership.currentPeriodStart = nextPeriod.periodStart
            currentMembership.currentPeriodEnd = nextPeriod.periodEnd
            currentMembership.pointsGranted = nextPeriod.pointsGranted
            currentMembership.pointsUsed = nextPeriod.pointsUsed ?? 0
            const saved = (await txManager.getRepository(UserMembership).save(currentMembership)) as MembershipWithPlan
            saved.plan = currentMembership.plan
            await this.createLedger(txManager, {
                tenantId: saved.tenantId,
                organizationId: saved.organizationId ?? null,
                userId: saved.userId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Renew,
                pointsDelta: saved.pointsGranted ?? 0,
                reason: 'Scheduled membership period activated'
            })
            return saved
        }

        if (manager) {
            return activate(membership, manager)
        }
        return this.dataSource.transaction(async (txManager) => {
            await this.acquireMembershipAssignmentLock(
                txManager,
                membership.tenantId,
                membership.organizationId ?? null,
                membership.userId
            )
            const lockedMembership = await this.findMembershipForUpdate(
                membership.tenantId,
                membership.organizationId ?? null,
                membership.userId,
                [MembershipStatusEnum.Active],
                txManager
            )
            return lockedMembership ? activate(lockedMembership, txManager) : null
        })
    }

    private async ensureCurrentPeriodRecord(
        membership: MembershipWithPlan,
        manager: EntityManager
    ): Promise<MembershipPeriod> {
        const repository = manager.getRepository(MembershipPeriod)
        const existing = await repository.findOne({
            where: {
                tenantId: membership.tenantId,
                membershipId: membership.id,
                status: MembershipPeriodStatusEnum.Active
            },
            order: { periodStart: 'DESC' }
        })
        if (existing) {
            existing.pointsGranted = membership.pointsGranted
            existing.pointsUsed = membership.pointsUsed ?? 0
            return repository.save(existing)
        }

        const snapshot = membership.planSnapshot ?? this.createPlanSnapshot(membership.plan)
        return repository.save(
            repository.create({
                tenantId: membership.tenantId,
                organizationId: membership.organizationId ?? null,
                membershipId: membership.id,
                userId: membership.userId,
                planId: membership.planId,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: membership.currentPeriodStart,
                periodEnd: membership.currentPeriodEnd,
                pointsGranted: membership.pointsGranted,
                pointsUsed: membership.pointsUsed ?? 0,
                source: membership.source,
                renewalMode: membership.renewalMode,
                sourceReference: null,
                sourceSequence: 0,
                planSnapshot: snapshot
            })
        )
    }

    private async synchronizeCurrentPeriodProjection(membership: MembershipWithPlan, manager: EntityManager) {
        if (!this.periodRepository) {
            return
        }
        const repository = manager.getRepository(MembershipPeriod)
        let period = await repository.findOne({
            where: {
                tenantId: membership.tenantId,
                membershipId: membership.id,
                status: MembershipPeriodStatusEnum.Active
            },
            order: { periodStart: 'DESC' }
        })
        if (!period) {
            period = repository.create({
                tenantId: membership.tenantId,
                organizationId: membership.organizationId ?? null,
                membershipId: membership.id,
                userId: membership.userId,
                planId: membership.planId,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: membership.currentPeriodStart,
                periodEnd: membership.currentPeriodEnd,
                pointsGranted: membership.pointsGranted,
                pointsUsed: membership.pointsUsed ?? 0,
                source: membership.source,
                renewalMode: membership.renewalMode,
                sourceReference: null,
                sourceSequence: 0,
                planSnapshot: membership.planSnapshot ?? this.createPlanSnapshot(membership.plan)
            })
        } else {
            period.organizationId = membership.organizationId ?? null
            period.userId = membership.userId
            period.planId = membership.planId
            period.periodStart = membership.currentPeriodStart
            period.periodEnd = membership.currentPeriodEnd
            period.pointsGranted = membership.pointsGranted
            period.pointsUsed = membership.pointsUsed ?? 0
            period.source = membership.source
            period.renewalMode = membership.renewalMode
            period.planSnapshot = membership.planSnapshot ?? this.createPlanSnapshot(membership.plan)
        }
        await repository.save(period)
    }

    private async cancelScheduledMembershipPeriods(
        membershipId: string,
        manager: EntityManager,
        options?: { preserveExternallyManaged?: boolean }
    ) {
        if (!this.periodRepository) {
            return
        }
        const repository = manager.getRepository(MembershipPeriod)
        const periods = await repository.find({
            where: {
                membershipId,
                status: MembershipPeriodStatusEnum.Scheduled
            }
        })
        const isExternallyManaged = (period: MembershipPeriod) =>
            period.source === MembershipSourceEnum.External || !!period.sourceReference?.trim()
        if (!options?.preserveExternallyManaged && periods.some(isExternallyManaged)) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.ExternalMembershipPeriodCancellationRequired',
                    'Externally managed periods must be refunded and cancelled by the external billing system.'
                )
            )
        }
        for (const period of periods) {
            if (options?.preserveExternallyManaged && isExternallyManaged(period)) {
                continue
            }
            period.status = MembershipPeriodStatusEnum.Cancelled
            await repository.save(period)
        }
    }

    private async completeCurrentMembershipPeriod(membership: UserMembership, manager: EntityManager) {
        if (!this.periodRepository) {
            return
        }
        const repository = manager.getRepository(MembershipPeriod)
        const period = await repository.findOne({
            where: {
                tenantId: membership.tenantId,
                membershipId: membership.id,
                status: MembershipPeriodStatusEnum.Active
            },
            order: { periodStart: 'DESC' }
        })
        if (!period) {
            return
        }
        period.status = MembershipPeriodStatusEnum.Completed
        period.periodEnd = membership.currentPeriodEnd
        period.pointsUsed = membership.pointsUsed ?? 0
        await repository.save(period)
    }

    private async resolvePeriodPlan(
        tenantId: string,
        organizationId: string | null,
        planId: string,
        snapshot: IMembershipPlanSnapshot | undefined,
        manager: EntityManager
    ): Promise<IMembershipPlan> {
        if (snapshot?.planId && snapshot.planId !== planId) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPlanSnapshotMismatch',
                    'Membership plan snapshot does not match the requested plan.'
                )
            )
        }
        const plan = await manager.getRepository(MembershipPlan).findOne({
            where: {
                ...this.scopeWhere(tenantId, organizationId),
                id: planId
            }
        })
        if (plan) {
            if (!snapshot && plan.status !== MembershipPlanStatusEnum.Active) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.MembershipPlanInactive',
                        'Archived membership plans cannot be renewed.'
                    )
                )
            }
            return plan
        }
        throw new BadRequestException('Membership plan not found.')
    }

    private createPlanSnapshot(plan: IMembershipPlan): IMembershipPlanSnapshot {
        return {
            planId: plan.id,
            code: plan.code,
            name: plan.name,
            description: plan.description ?? null,
            level: plan.level,
            catalogSourcePlanId: plan.catalogSourcePlanId ?? null,
            period: plan.period,
            includedPoints: plan.includedPoints,
            tokensPerPoint: plan.tokensPerPoint,
            allowedModels: plan.allowedModels?.map((rule) => ({ ...rule })),
            modelMultipliers: plan.modelMultipliers?.map((rule) => ({ ...rule })),
            rateLimits: plan.rateLimits?.map((rule) => ({ ...rule }))
        }
    }

    private copyPlanSnapshot(snapshot: IMembershipPlanSnapshot, planId: string): IMembershipPlanSnapshot {
        return {
            ...snapshot,
            planId,
            allowedModels: snapshot.allowedModels?.map((rule) => ({ ...rule })),
            modelMultipliers: snapshot.modelMultipliers?.map((rule) => ({ ...rule })),
            rateLimits: snapshot.rateLimits?.map((rule) => ({ ...rule }))
        }
    }

    private planFromSnapshot(
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
            tokensPerPoint: snapshot.tokensPerPoint,
            allowedModels: snapshot.allowedModels?.map((rule) => ({ ...rule })),
            modelMultipliers: snapshot.modelMultipliers?.map((rule) => ({ ...rule })),
            rateLimits: snapshot.rateLimits?.map((rule) => ({ ...rule }))
        }
    }

    private hydrateMembershipPlanSnapshot(membership: UserMembership): MembershipWithPlan {
        if (membership.planSnapshot) {
            membership.plan = this.planFromSnapshot(
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

    private requirePeriodRepository(): Repository<MembershipPeriod> {
        if (!this.periodRepository) {
            throw new Error('Membership period repository is not available.')
        }
        return this.periodRepository
    }

    private requireNonNegativePointDelta(value: unknown) {
        const numberValue = Number(value)
        if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipUpgradePointsInvalid',
                    'Membership upgrade points must be a non-negative integer.'
                )
            )
        }
        return numberValue
    }

    private async findActiveMembership(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const qb = repository
            .createQueryBuilder('membership')
            .leftJoinAndSelect('membership.plan', 'plan')
            .innerJoin('membership.user', 'membershipUser')
            .where('membership.tenantId = :tenantId', { tenantId })
            .andWhere('membership.userId = :userId', { userId })
            .andWhere('membership.status = :status', { status: MembershipStatusEnum.Active })
            .andWhere('membershipUser.type = :userType', { userType: UserType.USER })
            .orderBy('membership.updatedAt', 'DESC')

        this.applyScopeFilter(qb, 'membership.organizationId', organizationId)
        const membership = await qb.getOne()
        return membership?.plan || membership?.planSnapshot ? this.hydrateMembershipPlanSnapshot(membership) : null
    }

    private async findActiveMembershipForUpdate(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        return this.findMembershipForUpdate(tenantId, organizationId, userId, [MembershipStatusEnum.Active], manager)
    }

    private async findManagedMembershipForUpdate(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager: EntityManager
    ): Promise<MembershipWithPlan | null> {
        return this.findMembershipForUpdate(tenantId, organizationId, userId, undefined, manager)
    }

    private async findMembershipForUpdate(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        statuses: MembershipStatusEnum[] | undefined,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const qb = repository
            .createQueryBuilder('membership')
            .leftJoinAndSelect('membership.plan', 'plan')
            .innerJoin('membership.user', 'membershipUser')
            .where('membership.tenantId = :tenantId', { tenantId })
            .andWhere('membership.userId = :userId', { userId })
            .andWhere('membershipUser.type = :userType', { userType: UserType.USER })
            .orderBy('membership.updatedAt', 'DESC')

        if (statuses?.length === 1) {
            qb.andWhere('membership.status = :status', { status: statuses[0] })
        } else if (statuses?.length) {
            qb.andWhere('membership.status IN (:...statuses)', { statuses })
        }

        this.applyScopeFilter(qb, 'membership.organizationId', organizationId)
        if (manager) {
            qb.setLock('pessimistic_write', undefined, ['membership'])
        }

        const membership = await qb.getOne()
        return membership?.plan || membership?.planSnapshot ? this.hydrateMembershipPlanSnapshot(membership) : null
    }

    private async expireDuplicateManagedMemberships(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        retainedMembershipId: string,
        manager: EntityManager
    ) {
        const repository = manager.getRepository(UserMembership)
        const qb = repository
            .createQueryBuilder('membership')
            .where('membership.tenantId = :tenantId', { tenantId })
            .andWhere('membership.userId = :userId', { userId })
            .andWhere('membership.id != :retainedMembershipId', { retainedMembershipId })
            .andWhere('membership.status IN (:...statuses)', {
                statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
            })
            .setLock('pessimistic_write', undefined, ['membership'])

        this.applyScopeFilter(qb, 'membership.organizationId', organizationId)
        const duplicates = await qb.getMany()
        for (const duplicate of duplicates) {
            duplicate.status = MembershipStatusEnum.Expired
            await repository.save(duplicate)
            await this.completeCurrentMembershipPeriod(duplicate, manager)
            await this.cancelScheduledMembershipPeriods(duplicate.id, manager)
            await this.createLedger(manager, {
                tenantId,
                organizationId,
                userId,
                membershipId: duplicate.id,
                planId: duplicate.planId,
                source: MembershipLedgerSourceEnum.StatusChange,
                pointsDelta: 0,
                reason: 'Duplicate current membership replaced'
            })
        }
    }

    private async requireManagedMembership(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager: EntityManager
    ): Promise<MembershipWithPlan> {
        const membership = await this.findManagedMembershipForUpdate(tenantId, organizationId, userId, manager)
        if (!membership?.plan || !membership.planId) {
            throw new BadRequestException(
                this.translateMembershipError('server-ai:Error.MembershipNotFound', 'Membership not found.')
            )
        }
        return membership
    }

    private async renewMembership(
        membership: MembershipWithPlan,
        manager?: EntityManager
    ): Promise<MembershipWithPlan> {
        if (!manager) {
            return this.dataSource.transaction(async (txManager) => {
                await this.acquireMembershipAssignmentLock(
                    txManager,
                    membership.tenantId,
                    membership.organizationId ?? null,
                    membership.userId
                )
                const lockedMembership = await this.findMembershipForUpdate(
                    membership.tenantId,
                    membership.organizationId ?? null,
                    membership.userId,
                    [MembershipStatusEnum.Active, MembershipStatusEnum.Paused],
                    txManager
                )
                if (!lockedMembership) {
                    throw new BadRequestException('Membership not found.')
                }
                return this.renewMembership(lockedMembership, txManager)
            })
        }
        if (membership.plan.status !== MembershipPlanStatusEnum.Active) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPlanInactive',
                    'Archived membership plans cannot be renewed.'
                )
            )
        }
        const repository = manager.getRepository(UserMembership)
        const currentPeriod = await this.ensureCurrentPeriodRecord(membership, manager)
        const now = new Date()
        const currentPeriodEnd = new Date(membership.currentPeriodEnd)
        const start = currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now
        const previousPointsUsed = membership.pointsUsed ?? 0
        membership.pointsTotalUsed = (membership.pointsTotalUsed ?? 0) + (membership.pointsUsed ?? 0)
        membership.pointsUsed = 0
        membership.pointsGranted = membership.plan.includedPoints
        membership.status = MembershipStatusEnum.Active
        membership.currentPeriodStart = start
        membership.currentPeriodEnd = periodEndFor(start, membership.plan.period)
        const saved = (await repository.save(membership)) as MembershipWithPlan
        saved.plan = membership.plan
        currentPeriod.status = MembershipPeriodStatusEnum.Completed
        currentPeriod.pointsUsed = previousPointsUsed
        await manager.getRepository(MembershipPeriod).save(currentPeriod)
        await manager.getRepository(MembershipPeriod).save(
            manager.getRepository(MembershipPeriod).create({
                tenantId: saved.tenantId,
                organizationId: saved.organizationId ?? null,
                membershipId: saved.id,
                userId: saved.userId,
                planId: saved.planId,
                status: MembershipPeriodStatusEnum.Active,
                periodStart: saved.currentPeriodStart,
                periodEnd: saved.currentPeriodEnd,
                pointsGranted: saved.pointsGranted,
                pointsUsed: 0,
                source: saved.source,
                renewalMode: saved.renewalMode,
                sourceReference: null,
                sourceSequence: 0,
                planSnapshot: saved.planSnapshot ?? this.createPlanSnapshot(saved.plan)
            })
        )
        await this.createLedger(manager, {
            tenantId: saved.tenantId,
            organizationId: saved.organizationId ?? null,
            userId: saved.userId,
            membershipId: saved.id,
            planId: saved.planId,
            source: MembershipLedgerSourceEnum.Renew,
            pointsDelta: saved.pointsGranted ?? 0,
            reason: 'Membership period renewed'
        })
        return saved
    }

    private async synchronizeAssignedPlanPoints(manager: EntityManager, plan: MembershipPlan) {
        const repository = manager.getRepository(UserMembership)
        const memberships = (await repository
            .createQueryBuilder('membership')
            .innerJoin('membership.user', 'membershipUser')
            .where('membership.tenantId = :tenantId', { tenantId: plan.tenantId })
            .andWhere('membership.planId = :planId', { planId: plan.id })
            .andWhere('membership.status IN (:...statuses)', {
                statuses: [MembershipStatusEnum.Active, MembershipStatusEnum.Paused]
            })
            .andWhere('membershipUser.type = :userType', { userType: UserType.USER })
            .setLock('pessimistic_write', undefined, ['membership'])
            .getMany()) as UserMembership[]

        for (const membership of memberships) {
            if (membership.planSnapshot) {
                continue
            }
            const previousPointsGranted = membership.pointsGranted
            membership.pointsGranted = plan.includedPoints
            await repository.save(membership)
            await this.createLedger(manager, {
                tenantId: membership.tenantId,
                organizationId: membership.organizationId ?? null,
                userId: membership.userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Adjustment,
                pointsDelta:
                    previousPointsGranted === null || plan.includedPoints === null
                        ? 0
                        : plan.includedPoints - previousPointsGranted,
                reason: 'Membership plan allowance updated'
            })
        }
    }

    private assertDefaultPlanIsActive(status: MembershipPlanStatusEnum, isDefault: boolean) {
        if (status === MembershipPlanStatusEnum.Archived && isDefault) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipArchivedPlanCannotBeDefault',
                    'An archived membership plan cannot be the default plan.'
                )
            )
        }
    }

    private assertAdminPeriodGrantAllowed(membership: MembershipWithPlan) {
        if (membership.source === MembershipSourceEnum.External || !!membership.plan.catalogSourcePlanId) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPaidPlanRenewalNotAllowed',
                    'Purchased memberships must be renewed through billing.'
                )
            )
        }
    }

    private async createMembershipStatusLedger(
        manager: EntityManager | undefined,
        membership: MembershipWithPlan,
        reason: string
    ) {
        return this.createLedger(manager, {
            tenantId: membership.tenantId,
            organizationId: membership.organizationId ?? null,
            userId: membership.userId,
            membershipId: membership.id,
            planId: membership.planId,
            source: MembershipLedgerSourceEnum.StatusChange,
            pointsDelta: 0,
            reason
        })
    }

    private async findMembershipById(id: string, manager?: EntityManager): Promise<MembershipWithPlan> {
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const membership = await repository.findOne({
            where: { id },
            relations: ['user', 'plan', 'assignedBy']
        })
        if (!membership) {
            throw new BadRequestException('Membership not found.')
        }
        return this.hydrateMembershipPlanSnapshot(membership)
    }

    private async createLedger(
        manager: EntityManager | undefined,
        input: Partial<MembershipPointLedger>
    ): Promise<MembershipPointLedger> {
        const repository = manager?.getRepository(MembershipPointLedger) ?? this.ledgerRepository
        return repository.save(
            repository.create({
                ...input,
                actorId: input.actorId === undefined ? RequestContext.currentUserId() : input.actorId
            })
        )
    }

    private async clearDefaultPlan(
        tenantId: string,
        organizationId: string | null,
        manager: EntityManager,
        exceptId?: string
    ) {
        const qb = manager
            .getRepository(MembershipPlan)
            .createQueryBuilder()
            .update(MembershipPlan)
            .set({ isDefault: false })
            .where('tenantId = :tenantId', { tenantId })

        this.applyScopeFilter(qb, 'organizationId', organizationId)
        qb.andWhere('catalogSourcePlanId IS NULL')

        if (exceptId) {
            qb.andWhere('id != :exceptId', { exceptId })
        }

        await qb.execute()
    }

    private async assertPlanCodeAvailable(
        repository: Repository<MembershipPlan>,
        tenantId: string,
        organizationId: string | null,
        code: string,
        exceptId?: string
    ) {
        const qb = repository
            .createQueryBuilder('plan')
            .where('plan.tenantId = :tenantId', { tenantId })
            .andWhere('plan.code = :code', { code })

        this.applyScopeFilter(qb, 'plan.organizationId', organizationId)

        if (exceptId) {
            qb.andWhere('plan.id != :exceptId', { exceptId })
        }

        if ((await qb.getCount()) > 0) {
            throw new BadRequestException('Membership plan code already exists.')
        }
    }

    private async assertRateLimits(membership: MembershipWithPlan, provider?: string, model?: string) {
        const limits = (membership.plan.rateLimits ?? []).filter((limit) => {
            const providerMatches = !limit.provider || limit.provider === provider
            const modelMatches = !limit.model || limit.model === model || limit.model === '*'
            return providerMatches && modelMatches
        })

        for (const limit of limits) {
            const start = this.rateLimitStart(limit.period, membership.currentPeriodStart)
            const qb = this.ledgerRepository
                .createQueryBuilder('ledger')
                .select('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .where('ledger.tenantId = :tenantId', { tenantId: membership.tenantId })
                .andWhere('ledger.userId = :userId', { userId: membership.userId })
                .andWhere('ledger.source IN (:...sources)', {
                    sources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
                })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere(limit.provider ? 'ledger.provider = :provider' : '1=1', { provider: limit.provider })
                .andWhere(limit.model && limit.model !== '*' ? 'ledger.model = :model' : '1=1', { model: limit.model })
            this.applyScopeFilter(qb, 'ledger.organizationId', membership.organizationId ?? null)
            const row = await qb.getRawOne<NumericRaw>()
            if (toNumber(row?.pointsUsed) >= limit.pointLimit) {
                throw new ExceedingLimitException('Membership rate limit exceeded.')
            }
        }
    }

    private rateLimitStart(period: string, cycleStart: Date) {
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

    private resolveModelMultiplier(plan: Pick<IMembershipPlan, 'modelMultipliers'>, provider?: string, model?: string) {
        const multiplier = (plan.modelMultipliers ?? []).find((item) => {
            const providerMatches = !item.provider || item.provider === provider
            const modelMatches = !item.model || item.model === model || item.model === '*'
            return providerMatches && modelMatches
        })
        return Math.max(0, Number(multiplier?.multiplier ?? 1))
    }

    private async findTopLedgerRanks(
        tenantId: string,
        userId: string,
        dimension: 'model' | 'xpertId' | 'threadId',
        query: IMembershipUsageQuery | undefined,
        start: Date,
        end: Date
    ) {
        const qb = this.applyLedgerFilters(
            this.ledgerRepository
                .createQueryBuilder('ledger')
                .select(`ledger.${dimension}`, 'key')
                .addSelect('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .where('ledger.tenantId = :tenantId', { tenantId })
                .andWhere('ledger.userId = :userId', { userId })
                .andWhere('ledger.source IN (:...usageSources)', {
                    usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
                })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .andWhere(`ledger.${dimension} IS NOT NULL`)
                .groupBy(`ledger.${dimension}`)
                .orderBy('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'DESC')
                .take(5),
            query
        )

        if (dimension === 'xpertId') {
            qb.leftJoin(
                'xpert',
                'rank_xpert',
                '"rank_xpert"."tenantId" = ledger."tenantId" AND "rank_xpert"."id"::text = ledger."xpertId" AND "rank_xpert"."deletedAt" IS NULL'
            ).addSelect("COALESCE(NULLIF(MAX(rank_xpert.title), ''), NULLIF(MAX(rank_xpert.name), ''))", 'label')
        } else if (dimension === 'threadId') {
            qb.leftJoin(
                'chat_conversation',
                'rank_conversation',
                '"rank_conversation"."tenantId" = ledger."tenantId" AND "rank_conversation"."threadId" = ledger."threadId"'
            ).addSelect("NULLIF(MAX(rank_conversation.title), '')", 'label')
        }

        const rows = await qb.getRawMany<NumericRaw & { key?: string; label?: string }>()
        return rows.map((row) => ({
            key: row.key,
            label: row.label?.trim() || row.key,
            pointsUsed: toNumber(row.pointsUsed),
            tokenUsed: toNumber(row.tokenUsed)
        }))
    }

    private applyMembershipUsageLedgerFilter<
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
        this.applyScopeFilter(qb, 'ledger.organizationId', organizationId)
        return qb
    }

    private applyLedgerFilters<T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }>(
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

    private toUsageSummary(row: MembershipUsageSummaryRaw): IMembershipUsageSummary {
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

    private resolveDateRange(query?: IMembershipUsageQuery) {
        const end = query?.end ? new Date(query.end) : new Date()
        const start = query?.start ? new Date(query.start) : new Date(end)
        if (!query?.start) {
            start.setDate(start.getDate() - 29)
            start.setHours(0, 0, 0, 0)
        }
        return { start, end }
    }

    private toMembershipMe(
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

    private pointsRemaining(membership: MembershipWithPlan) {
        if (membership.pointsGranted === null) {
            return null
        }
        return Math.max(0, (membership.pointsGranted ?? 0) - (membership.pointsUsed ?? 0))
    }

    private assertCopilotScopeMatches(access: MembershipModelAccess, copilotOrganizationId?: string | null) {
        const normalizedCopilotOrganizationId = this.normalizeScopeOrganizationId(copilotOrganizationId)
        if (normalizedCopilotOrganizationId !== access.organizationId) {
            throw new ExceedingLimitException(
                this.translateMembershipError(
                    'server-ai:Error.CopilotModelUnavailableForMembershipPlan',
                    'Copilot model is not available for the current membership plan.'
                )
            )
        }
    }

    private assertModelAllowed(plan: IMembershipPlan, provider?: string, model?: string) {
        if (!this.isModelAllowed(plan, provider, model)) {
            throw new ExceedingLimitException(
                this.translateMembershipError(
                    'server-ai:Error.CopilotModelUnavailableForMembershipPlan',
                    'Copilot model is not available for the current membership plan.'
                )
            )
        }
    }

    private translateMembershipError(key: string, fallback: string) {
        const message = t(key, { defaultValue: fallback })
        return typeof message === 'string' && message !== key ? message : fallback
    }

    private normalizePlanCode(value: unknown, fallback?: string) {
        const code = typeof value === 'string' ? value.trim() : fallback
        if (!code || code.length > 100) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipPlanCode',
                    'Membership plan code is required and must not exceed 100 characters.'
                )
            )
        }
        return code
    }

    private normalizePlanName(value: unknown, fallback?: string) {
        const name = typeof value === 'string' ? value.trim() : fallback
        if (!name || name.length > 255) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipPlanName',
                    'Membership plan name is required and must not exceed 255 characters.'
                )
            )
        }
        return name
    }

    private nonNegativeNumberOrNull(value: unknown, fallback: number) {
        if (value === undefined) {
            return fallback
        }
        if (value === null) {
            return null
        }
        const numberValue = Number(value)
        if (!Number.isFinite(numberValue) || numberValue < 0 || !Number.isInteger(numberValue)) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipIncludedPoints',
                    'Included points must be a non-negative integer or unlimited.'
                )
            )
        }
        return numberValue
    }

    private optionalNonNegativeNumber(value: unknown): number | null | undefined {
        if (value === undefined) {
            return undefined
        }
        if (value === null) {
            return null
        }
        const numberValue = Number(value)
        if (!Number.isFinite(numberValue) || numberValue < 0) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipPrice',
                    'Membership plan price must be a non-negative number.'
                )
            )
        }
        return numberValue
    }

    private requireNonZeroPointDelta(value: unknown) {
        const numberValue = Number(value)
        const pointDelta = Number(numberValue.toFixed(3))
        if (
            !Number.isFinite(numberValue) ||
            pointDelta === 0 ||
            Math.abs(numberValue - pointDelta) > Number.EPSILON * Math.max(1, Math.abs(numberValue))
        ) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipPointDelta',
                    'Point adjustment must be non-zero and use at most three decimal places.'
                )
            )
        }
        return pointDelta
    }

    private async resolveTenantTokensPerPoint(tenantId: string) {
        const setting = await this.tenantSettingRepository?.findOne({
            where: {
                tenantId,
                name: MEMBERSHIP_TOKENS_PER_POINT_SETTING
            }
        })
        const numberValue = Number(setting?.value)
        return MEMBERSHIP_TOKENS_PER_POINT_OPTIONS.some((option) => option === numberValue)
            ? numberValue
            : DEFAULT_MEMBERSHIP_TOKENS_PER_POINT
    }

    private normalizeAllowedModels(value: unknown): IMembershipAllowedModel[] {
        if (value === undefined || value === null) {
            return []
        }
        if (!Array.isArray(value)) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipAllowedModels',
                    'Allowed models must be an array of provider and model pairs.'
                )
            )
        }

        return value.map((item) => {
            const provider =
                typeof item === 'object' && item !== null && 'provider' in item && typeof item.provider === 'string'
                    ? item.provider.trim()
                    : ''
            const model =
                typeof item === 'object' && item !== null && 'model' in item && typeof item.model === 'string'
                    ? item.model.trim()
                    : ''
            if (!provider || !model) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InvalidMembershipAllowedModels',
                        'Allowed models must be an array of provider and model pairs.'
                    )
                )
            }
            return { provider, model }
        })
    }

    private normalizeModelMultipliers(value: unknown): IMembershipModelMultiplier[] {
        if (value === undefined || value === null) {
            return []
        }
        if (!Array.isArray(value)) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipModelMultipliers',
                    'Model multipliers must be an array of model rules.'
                )
            )
        }

        return value.map((item) => {
            const provider = this.readOptionalRuleText(item, 'provider')
            const model = this.readOptionalRuleText(item, 'model')
            const multiplier =
                typeof item === 'object' && item !== null && 'multiplier' in item ? Number(item.multiplier) : NaN
            if (!Number.isFinite(multiplier) || multiplier < 0) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InvalidMembershipModelMultipliers',
                        'Each model multiplier must be a non-negative number.'
                    )
                )
            }
            return { provider, model, multiplier }
        })
    }

    private normalizeRateLimits(value: unknown): IMembershipRateLimit[] {
        if (value === undefined || value === null) {
            return []
        }
        if (!Array.isArray(value)) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipRateLimits',
                    'Rate limits must be an array of usage rules.'
                )
            )
        }

        return value.map((item) => {
            const provider = this.readOptionalRuleText(item, 'provider')
            const model = this.readOptionalRuleText(item, 'model')
            const period =
                typeof item === 'object' && item !== null && 'period' in item && typeof item.period === 'string'
                    ? item.period
                    : ''
            const pointLimit =
                typeof item === 'object' && item !== null && 'pointLimit' in item ? Number(item.pointLimit) : NaN
            if (!['hour', 'day', 'week', 'cycle'].includes(period) || !Number.isFinite(pointLimit) || pointLimit <= 0) {
                throw new BadRequestException(
                    this.translateMembershipError(
                        'server-ai:Error.InvalidMembershipRateLimits',
                        'Each rate limit requires a valid period and a positive point limit.'
                    )
                )
            }
            return {
                provider,
                model,
                period: period as IMembershipRateLimit['period'],
                pointLimit
            }
        })
    }

    private readOptionalRuleText(value: unknown, property: 'provider' | 'model') {
        if (typeof value !== 'object' || value === null || !(property in value)) {
            return null
        }
        const propertyValue = value[property]
        if (propertyValue === undefined || propertyValue === null || propertyValue === '') {
            return null
        }
        if (typeof propertyValue !== 'string') {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipRuleText',
                    'Provider and model values must be text.'
                )
            )
        }
        const normalized = propertyValue.trim()
        if (!normalized || normalized.length > 255) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.InvalidMembershipRuleText',
                    'Provider and model values must be valid text.'
                )
            )
        }
        return normalized
    }

    private slugify(value: string) {
        return (value || DEFAULT_PLAN_NAME)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
    }

    private requireCurrentScope(): MembershipScope {
        return {
            tenantId: this.requireTenant(),
            organizationId: this.normalizeScopeOrganizationId(RequestContext.getOrganizationId())
        }
    }

    private resolveScope(input?: ResolveScopeInput): MembershipScope {
        return {
            tenantId: input?.tenantId ?? this.requireTenant(),
            organizationId: this.normalizeScopeOrganizationId(
                input?.organizationId !== undefined ? input.organizationId : RequestContext.getOrganizationId()
            )
        }
    }

    private scopeWhere(tenantId: string, organizationId: string | null) {
        return {
            tenantId,
            organizationId: organizationId ?? IsNull()
        }
    }

    private applyScopeFilter<T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }>(
        qb: T,
        column: string,
        organizationId: string | null
    ) {
        if (organizationId) {
            return qb.andWhere(`${column} = :organizationId`, { organizationId })
        }
        return qb.andWhere(`${column} IS NULL`)
    }

    private normalizeScopeOrganizationId(organizationId?: string | null) {
        return organizationId?.trim() || null
    }

    private async normalizeAdminExpiringBefore(value: string, tenantId: string) {
        return DATE_ONLY_PATTERN.test(value)
            ? endOfDayInTimeZone(value, await this.resolveTenantTimeZone(tenantId))
            : new Date(value)
    }

    private async resolveTenantTimeZone(tenantId: string) {
        const organization = await this.organizationRepository?.findOne({
            where: { tenantId, isDefault: true },
            select: { id: true, timeZone: true }
        })
        return organization?.timeZone || 'UTC'
    }

    private requireTenant() {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException('Tenant is required.')
        }
        return tenantId
    }

    private requireUser() {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new ForbiddenException('User is required.')
        }
        return userId
    }
}
