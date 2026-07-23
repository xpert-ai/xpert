import {
    AiFeatureEnum,
    IMembershipAllowedModel,
    IMembershipMe,
    IMembershipModelMultiplier,
    IMembershipPlan,
    IMembershipRateLimit,
    IMembershipScopeStatus,
    IMembershipUsageSummary,
    IMembershipUsageOverview,
    IMembershipUsageQuery,
    IPagination,
    DEFAULT_MEMBERSHIP_TOKENS_PER_POINT,
    MEMBERSHIP_TOKENS_PER_POINT_SETTING,
    MEMBERSHIP_TOKENS_PER_POINT_OPTIONS,
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    UserType,
    TMembershipAssignInput,
    TMembershipPlanReassignInput,
    TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { FeatureOrganization, RequestContext, TenantSetting, User, UserOrganization } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import { ExceedingLimitException } from '../core/errors'
import { formatInUTC0 } from '../shared/utils'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'
import { Xpert } from '../xpert/xpert.entity'
import { Copilot } from '../copilot/copilot.entity'

const DEFAULT_PLAN_NAME = 'Default'
const DEFAULT_INCLUDED_POINTS = 1000
const DEFAULT_UNLIMITED_PLAN_CODE = 'default-unlimited'
const DEFAULT_UNLIMITED_PLAN_NAME = 'Default Unlimited'
const DEFAULT_TENANT_PLAN_GRANT_REASON = 'Default tenant plan grant'
const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'

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
}

type BillableUserInput = Pick<RecordUsageInput, 'tenantId' | 'userId' | 'xpertId'>

type MembershipWithPlan = UserMembership & { plan: IMembershipPlan; planId: string }

type MembershipScope = {
    tenantId: string
    organizationId: string | null
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
    value.setMonth(value.getMonth() + months)
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
        private readonly tenantSettingRepository?: Repository<TenantSetting>
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
            where: this.scopeWhere(tenantId, organizationId),
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

        return this.dataSource.transaction(async (manager) => {
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
    }

    async updatePlan(id: string, input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        const scope = this.requireCurrentScope()
        await this.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(MembershipPlan)
            const plan = await repository.findOne({ where: { ...this.scopeWhere(tenantId, organizationId), id } })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }
            const nextStatus = input.status ?? plan.status
            const nextIsDefault = input.isDefault ?? plan.isDefault
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
            if (input.status !== undefined) {
                plan.status = input.status
            }
            if (input.period !== undefined) {
                plan.period = input.period
            }
            if (input.includedPoints !== undefined) {
                plan.includedPoints = this.nonNegativeNumberOrNull(input.includedPoints, DEFAULT_INCLUDED_POINTS)
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
            if (input.includedPoints !== undefined) {
                await this.synchronizeAssignedPlanPoints(manager, saved)
            }
            return saved
        })
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
                planRepository.findOne({ where: { ...this.scopeWhere(tenantId, organizationId), id: planId } }),
                planRepository.findOne({
                    where: {
                        ...this.scopeWhere(tenantId, organizationId),
                        id: input.targetPlanId,
                        status: MembershipPlanStatusEnum.Active
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
            return this.buildScopeStatus(scope, manager)
        }
        if (!(await this.hasActivePlan(scope.tenantId, scope.organizationId, manager))) {
            return this.buildScopeStatus(scope, manager)
        }

        const initialize = async (txManager: EntityManager) => {
            const plan = await this.ensureDefaultOrganizationPlan(scope, txManager)
            await this.ensureOrganizationMemberMemberships(scope, plan, input?.assignedById ?? null, txManager)
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
            await this.acquireTenantDefaultMembershipLock(txManager, scope.tenantId, input.userId)
            const existingMembership = await this.findManagedMembershipForUpdate(
                scope.tenantId,
                scope.organizationId,
                input.userId,
                txManager
            )
            if (existingMembership) {
                return existingMembership.status === MembershipStatusEnum.Active ? existingMembership : null
            }

            const plan = await this.findDefaultPlan(scope.tenantId, scope.organizationId, txManager)
            if (!plan) {
                return null
            }

            const start = new Date()
            const repository = txManager.getRepository(UserMembership)
            const membership = await repository.save(
                repository.create({
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
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
            await this.createLedger(txManager, {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: input.userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Grant,
                pointsDelta: plan.includedPoints ?? 0,
                reason: DEFAULT_TENANT_PLAN_GRANT_REASON
            })
            return membership
        }

        return manager ? ensure(manager) : this.dataSource.transaction(ensure)
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
                    status: MembershipPlanStatusEnum.Active
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
            record.status = MembershipStatusEnum.Active
            record.source = input.source ?? MembershipSourceEnum.Admin
            record.renewalMode = input.renewalMode ?? MembershipRenewalModeEnum.Auto
            record.currentPeriodStart = start
            record.currentPeriodEnd = end
            record.pointsGranted = plan.includedPoints
            record.pointsUsed = 0
            record.assignedById = assignedById
            record.note = input.note

            const saved = await repository.save(record)
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
            const renewed = await this.renewMembership(membership, manager)
            return this.findMembershipById(renewed.id, manager)
        })
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
                membership = await this.renewMembership(membership, manager)
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
        >
    ): Promise<void> {
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
            userId: input.userId,
            xpertId: input.xpertId
        })
        if (!access) {
            throw new ExceedingLimitException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPlanRequired',
                    'Membership plan is required to use Copilot models.'
                )
            )
        }
        this.assertCopilotScopeMatches(access, input.copilotOrganizationId)
        this.assertModelAllowed(access.membership.plan, input.provider, input.model)

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
        await this.assertRateLimits(access.membership, input.provider, input.model)
    }

    async recordUsage(input: RecordUsageInput): Promise<MembershipPointLedger | null> {
        const tokenUsed = Math.max(0, Math.trunc(input.tokenUsed ?? 0))
        if (!tokenUsed) {
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
                    userId: input.userId,
                    xpertId: input.xpertId
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
            this.assertCopilotScopeMatches(access, input.copilotOrganizationId)
            this.assertModelAllowed(access.membership.plan, input.provider, input.model)

            const { membership, organizationId } = access
            const billableUserId = membership.userId
            const pointsUsed = this.calculatePoints(
                tokenUsed,
                membership.plan,
                input.provider,
                input.model,
                tokensPerPoint
            )
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
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
                })
            }
            const membershipPointsRemaining = this.pointsRemaining(membership)
            let membershipPointsUsed =
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
                membershipPointsUsed = pointsUsed - personalPointsUsed
            }

            membership.pointsUsed = (membership.pointsUsed ?? 0) + membershipPointsUsed
            const saved = await manager.getRepository(UserMembership).save(membership)
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
                usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
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
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
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

    private async resolveBillableUserId(input: BillableUserInput, manager?: EntityManager): Promise<string> {
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

        return xpert?.createdById ?? input.userId
    }

    calculatePoints(
        tokenUsed: number,
        plan: MembershipPlan,
        provider?: string,
        model?: string,
        tokensPerPoint = DEFAULT_MEMBERSHIP_TOKENS_PER_POINT
    ): number {
        const multiplier = this.resolveModelMultiplier(plan, provider, model)
        return Number(((tokenUsed / tokensPerPoint) * multiplier).toFixed(10))
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
                where: this.scopeWhere(scope.tenantId, scope.organizationId),
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

    private async ensureDefaultOrganizationPlan(scope: MembershipScope, manager: EntityManager) {
        const repository = manager.getRepository(MembershipPlan)
        const tokensPerPoint = await this.resolveTenantTokensPerPoint(scope.tenantId)
        const existingDefaultPlan = await this.findDefaultPlan(scope.tenantId, scope.organizationId, manager)
        if (existingDefaultPlan) {
            return existingDefaultPlan
        }

        const activePlan = await repository.findOne({
            where: {
                ...this.scopeWhere(scope.tenantId, scope.organizationId),
                status: MembershipPlanStatusEnum.Active
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
                code: DEFAULT_UNLIMITED_PLAN_CODE
            }
        })
        if (archivedDefaultPlan) {
            await this.clearDefaultPlan(scope.tenantId, scope.organizationId, manager, archivedDefaultPlan.id)
            archivedDefaultPlan.name = archivedDefaultPlan.name || DEFAULT_UNLIMITED_PLAN_NAME
            archivedDefaultPlan.status = MembershipPlanStatusEnum.Active
            archivedDefaultPlan.isDefault = true
            archivedDefaultPlan.includedPoints = null
            archivedDefaultPlan.tokensPerPoint = tokensPerPoint
            archivedDefaultPlan.period = archivedDefaultPlan.period || MembershipPeriodEnum.Monthly
            archivedDefaultPlan.modelMultipliers = archivedDefaultPlan.modelMultipliers ?? []
            archivedDefaultPlan.rateLimits = archivedDefaultPlan.rateLimits ?? []
            return repository.save(archivedDefaultPlan)
        }

        const plan = repository.create({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            code: DEFAULT_UNLIMITED_PLAN_CODE,
            name: DEFAULT_UNLIMITED_PLAN_NAME,
            status: MembershipPlanStatusEnum.Active,
            isDefault: true,
            period: MembershipPeriodEnum.Monthly,
            includedPoints: null,
            tokensPerPoint,
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

        const repository = manager.getRepository(UserMembership)
        const existingMemberships = await repository.find({
            select: ['userId'],
            where: {
                ...this.scopeWhere(scope.tenantId, scope.organizationId),
                userId: In(userIds)
            }
        })
        const existingUserIds = new Set(existingMemberships.map((membership) => membership.userId))
        const missingUserIds = userIds.filter((userId) => !existingUserIds.has(userId))
        if (!missingUserIds.length) {
            return
        }

        const start = new Date()
        const end = periodEndFor(start, plan.period)
        for (const userId of missingUserIds) {
            const membership = await repository.save(
                repository.create({
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    userId,
                    planId: plan.id,
                    status: MembershipStatusEnum.Active,
                    source: MembershipSourceEnum.Organization,
                    renewalMode: MembershipRenewalModeEnum.Auto,
                    currentPeriodStart: start,
                    currentPeriodEnd: end,
                    pointsGranted: plan.includedPoints,
                    pointsUsed: 0,
                    pointsTotalUsed: 0,
                    assignedById: assignedById ?? undefined,
                    note: 'Organization membership initialized'
                })
            )
            await this.createLedger(manager, {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Assignment,
                pointsDelta: plan.includedPoints ?? 0,
                reason: 'Organization membership initialized'
            })
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
                isDefault: true
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
                    status: MembershipPlanStatusEnum.Active
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

        if (!membership.plan) {
            membership = await this.findMembershipById(membership.id, manager)
        }

        if (membership.plan.status !== MembershipPlanStatusEnum.Active) {
            return null
        }

        membership = await this.synchronizePlanAllowanceType(membership, manager)

        if (new Date(membership.currentPeriodEnd).getTime() <= Date.now()) {
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
        return (await qb.getOne()) as MembershipWithPlan | null
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

        return (await qb.getOne()) as MembershipWithPlan | null
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
        if (membership.plan.status !== MembershipPlanStatusEnum.Active) {
            throw new BadRequestException(
                this.translateMembershipError(
                    'server-ai:Error.MembershipPlanInactive',
                    'Archived membership plans cannot be renewed.'
                )
            )
        }
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const now = new Date()
        const currentPeriodEnd = new Date(membership.currentPeriodEnd)
        const start = currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now
        membership.pointsTotalUsed = (membership.pointsTotalUsed ?? 0) + (membership.pointsUsed ?? 0)
        membership.pointsUsed = 0
        membership.pointsGranted = membership.plan.includedPoints
        membership.status = MembershipStatusEnum.Active
        membership.currentPeriodStart = start
        membership.currentPeriodEnd = periodEndFor(start, membership.plan.period)
        const saved = (await repository.save(membership)) as MembershipWithPlan
        saved.plan = membership.plan
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
        const membership = (await repository.findOne({
            where: { id },
            relations: ['user', 'plan', 'assignedBy']
        })) as MembershipWithPlan | null
        if (!membership) {
            throw new BadRequestException('Membership not found.')
        }
        return membership
    }

    private async createLedger(
        manager: EntityManager | undefined,
        input: Partial<MembershipPointLedger>
    ): Promise<MembershipPointLedger> {
        const repository = manager?.getRepository(MembershipPointLedger) ?? this.ledgerRepository
        return repository.save(repository.create(input))
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

    private resolveModelMultiplier(plan: MembershipPlan, provider?: string, model?: string) {
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
                input?.organizationId ?? RequestContext.getOrganizationId()
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
