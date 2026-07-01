import {
    IMembershipMe,
    IMembershipUsageSummary,
    IMembershipUsageOverview,
    IMembershipUsageQuery,
    IPagination,
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipStatusEnum,
    TMembershipAssignInput,
    TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { ExceedingLimitException } from '../core/errors'
import { formatInUTC0 } from '../shared/utils'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'

const DEFAULT_PLAN_CODE = 'default'
const DEFAULT_PLAN_NAME = 'Default'
const DEFAULT_INCLUDED_POINTS = 1000
const DEFAULT_TOKENS_PER_POINT = 1000
const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'

type RecordUsageInput = {
    tenantId: string
    organizationId?: string
    userId: string
    provider?: string
    model?: string
    tokenUsed?: number
    xpertId?: string
    threadId?: string
    copilotId?: string
}

type MembershipWithPlan = UserMembership & { plan: MembershipPlan }

type NumericRaw = Record<string, string | number | null | undefined>

type MembershipUsageSummaryRaw = NumericRaw & {
    usageHour?: string | null
    provider?: string | null
    model?: string | null
    organizationId?: string | null
    xpertId?: string | null
    threadId?: string | null
    copilotId?: string | null
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
        private readonly ledgerRepository: Repository<MembershipPointLedger>
    ) {}

    async findPlans(): Promise<MembershipPlan[]> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        await this.ensureDefaultPlan(tenantId)
        return this.planRepository.find({
            where: { tenantId },
            order: { isDefault: 'DESC', createdAt: 'ASC' }
        })
    }

    async createPlan(input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        const plan = this.planRepository.create({
            tenantId,
            code: input.code?.trim() || this.slugify(input.name || DEFAULT_PLAN_NAME),
            name: input.name?.trim() || DEFAULT_PLAN_NAME,
            description: input.description,
            status: input.status ?? MembershipPlanStatusEnum.Active,
            isDefault: input.isDefault ?? false,
            period: input.period ?? MembershipPeriodEnum.Monthly,
            includedPoints: this.positiveInteger(input.includedPoints, DEFAULT_INCLUDED_POINTS),
            tokensPerPoint: this.positiveInteger(input.tokensPerPoint, DEFAULT_TOKENS_PER_POINT),
            priceAmount: input.priceAmount,
            priceCurrency: input.priceCurrency,
            modelMultipliers: input.modelMultipliers ?? [],
            rateLimits: input.rateLimits ?? []
        })

        return this.dataSource.transaction(async (manager) => {
            if (plan.isDefault) {
                await this.clearDefaultPlan(tenantId, manager)
            }
            return manager.getRepository(MembershipPlan).save(plan)
        })
    }

    async updatePlan(id: string, input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(MembershipPlan)
            const plan = await repository.findOne({ where: { id, tenantId } })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }

            if (input.code !== undefined) {
                plan.code = input.code.trim()
            }
            if (input.name !== undefined) {
                plan.name = input.name.trim()
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
                plan.includedPoints = this.positiveInteger(input.includedPoints, DEFAULT_INCLUDED_POINTS)
            }
            if (input.tokensPerPoint !== undefined) {
                plan.tokensPerPoint = this.positiveInteger(input.tokensPerPoint, DEFAULT_TOKENS_PER_POINT)
            }
            if (input.priceAmount !== undefined) {
                plan.priceAmount = input.priceAmount
            }
            if (input.priceCurrency !== undefined) {
                plan.priceCurrency = input.priceCurrency
            }
            if (input.modelMultipliers !== undefined) {
                plan.modelMultipliers = input.modelMultipliers
            }
            if (input.rateLimits !== undefined) {
                plan.rateLimits = input.rateLimits
            }
            if (input.isDefault !== undefined) {
                plan.isDefault = input.isDefault
                if (plan.isDefault) {
                    await this.clearDefaultPlan(tenantId, manager, plan.id)
                }
            }

            return repository.save(plan)
        })
    }

    async archivePlan(id: string): Promise<MembershipPlan> {
        return this.updatePlan(id, { status: MembershipPlanStatusEnum.Archived, isDefault: false })
    }

    async findAdminUsers(options?: {
        userId?: string
        take?: number
        skip?: number
    }): Promise<IPagination<UserMembership>> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        if (options?.userId) {
            await this.ensureActiveMembership(tenantId, options.userId)
        }

        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const qb = this.membershipRepository
            .createQueryBuilder('membership')
            .leftJoinAndSelect('membership.user', 'user')
            .leftJoinAndSelect('membership.plan', 'plan')
            .where('membership.tenantId = :tenantId', { tenantId })
            .andWhere('membership.status = :status', { status: MembershipStatusEnum.Active })
            .orderBy('membership.updatedAt', 'DESC')
            .take(take)
            .skip(skip)

        if (options?.userId) {
            qb.andWhere('membership.userId = :userId', { userId: options.userId })
        }

        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async assignUser(userId: string, input: TMembershipAssignInput): Promise<UserMembership> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        const assignedById = RequestContext.currentUserId()

        return this.dataSource.transaction(async (manager) => {
            const plan = await manager.getRepository(MembershipPlan).findOne({
                where: { tenantId, id: input.planId, status: MembershipPlanStatusEnum.Active }
            })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }

            const membership = await this.findActiveMembershipForUpdate(tenantId, userId, manager)
            const start = input.currentPeriodStart ? new Date(input.currentPeriodStart) : new Date()
            const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : periodEndFor(start, plan.period)
            const repository = manager.getRepository(UserMembership)
            const record =
                membership ??
                repository.create({
                    tenantId,
                    userId,
                    status: MembershipStatusEnum.Active,
                    pointsTotalUsed: 0
                })

            if (membership) {
                record.pointsTotalUsed = (record.pointsTotalUsed ?? 0) + (record.pointsUsed ?? 0)
            }

            record.planId = plan.id
            record.status = MembershipStatusEnum.Active
            record.currentPeriodStart = start
            record.currentPeriodEnd = end
            record.pointsGranted = plan.includedPoints
            record.pointsUsed = 0
            record.assignedById = assignedById
            record.note = input.note

            const saved = await repository.save(record)
            await this.createLedger(manager, {
                tenantId,
                userId,
                membershipId: saved.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Assignment,
                pointsDelta: plan.includedPoints,
                reason: input.note ?? null
            })

            return this.findMembershipById(saved.id, manager)
        })
    }

    async adjustUserPoints(userId: string, input: TMembershipPointAdjustInput): Promise<UserMembership> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        if (!Number.isFinite(input.pointDelta) || input.pointDelta === 0) {
            throw new BadRequestException('pointDelta must be a non-zero number.')
        }

        return this.dataSource.transaction(async (manager) => {
            const membership = await this.ensureActiveMembership(tenantId, userId, manager, true)
            membership.pointsGranted = Math.max(0, (membership.pointsGranted ?? 0) + Math.trunc(input.pointDelta))
            const saved = await manager.getRepository(UserMembership).save(membership)
            await this.createLedger(manager, {
                tenantId,
                userId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Adjustment,
                pointsDelta: Math.trunc(input.pointDelta),
                reason: input.reason ?? null
            })
            return this.findMembershipById(saved.id, manager)
        })
    }

    async renewUser(userId: string): Promise<UserMembership> {
        this.assertTenantScope()
        const tenantId = this.requireTenant()
        return this.dataSource.transaction(async (manager) => {
            const membership = await this.ensureActiveMembership(tenantId, userId, manager, true)
            const renewed = await this.renewMembership(membership, manager)
            return this.findMembershipById(renewed.id, manager)
        })
    }

    async getMe(): Promise<IMembershipMe> {
        const membership = await this.ensureActiveMembership(this.requireTenant(), this.requireUser())
        return this.toMembershipMe(membership)
    }

    async getOverview(query?: IMembershipUsageQuery): Promise<IMembershipUsageOverview> {
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        const membership = await this.ensureActiveMembership(tenantId, userId)
        const base = this.toMembershipMe(membership)
        const { start, end } = this.resolveDateRange(query)

        const dailyRows = await this.applyLedgerFilters(
            this.ledgerRepository
                .createQueryBuilder('ledger')
                .select("DATE_TRUNC('day', ledger.createdAt)", 'day')
                .addSelect('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .where('ledger.tenantId = :tenantId', { tenantId })
                .andWhere('ledger.userId = :userId', { userId })
                .andWhere('ledger.source = :source', { source: MembershipLedgerSourceEnum.Usage })
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
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        return this.findUserUsage(tenantId, userId, query, options)
    }

    async findMyUsageSummaries(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<IMembershipUsageSummary>> {
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        return this.findUserUsageSummaries(tenantId, userId, query, options)
    }

    async findUserUsageSummaries(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
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
                .addSelect('COUNT(ledger.id)', 'callCount')
                .addSelect('COALESCE(SUM(ledger.pointsDelta), 0)', 'pointsDelta')
                .addSelect('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .addSelect('MIN(ledger.createdAt)', 'firstUsedAt')
                .addSelect('MAX(ledger.createdAt)', 'lastUsedAt')
                .addSelect('COUNT(*) OVER()', 'total')
                .where('ledger.tenantId = :tenantId', { tenantId })
                .andWhere('ledger.userId = :userId', { userId })
                .andWhere('ledger.source = :source', { source: MembershipLedgerSourceEnum.Usage })
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
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<MembershipPointLedger>> {
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const { start, end } = this.resolveDateRange(query)
        const qb = this.ledgerRepository
            .createQueryBuilder('ledger')
            .leftJoinAndSelect('ledger.plan', 'plan')
            .where('ledger.tenantId = :tenantId', { tenantId })
            .andWhere('ledger.userId = :userId', { userId })
            .andWhere('ledger.createdAt >= :start', { start })
            .andWhere('ledger.createdAt <= :end', { end })
            .orderBy('ledger.createdAt', 'DESC')
            .take(take)
            .skip(skip)

        this.applyLedgerFilters(qb, query)
        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async assertCanUse(input: Pick<RecordUsageInput, 'tenantId' | 'userId' | 'provider' | 'model'>): Promise<void> {
        const membership = await this.ensureActiveMembership(input.tenantId, input.userId)
        if (this.pointsRemaining(membership) <= 0) {
            throw new ExceedingLimitException('Membership points limit exceeded.')
        }
        await this.assertRateLimits(membership, input.provider, input.model)
    }

    async recordUsage(input: RecordUsageInput): Promise<MembershipPointLedger | null> {
        const tokenUsed = Math.max(0, Math.trunc(input.tokenUsed ?? 0))
        if (!tokenUsed) {
            return null
        }

        let exceeded = false
        const ledger = await this.dataSource.transaction(async (manager) => {
            const membership = await this.ensureActiveMembership(input.tenantId, input.userId, manager, true)
            const pointsUsed = this.calculatePoints(tokenUsed, membership.plan, input.provider, input.model)
            membership.pointsUsed = (membership.pointsUsed ?? 0) + pointsUsed
            const saved = await manager.getRepository(UserMembership).save(membership)
            const ledger = await this.createLedger(manager, {
                tenantId: input.tenantId,
                userId: input.userId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Usage,
                pointsDelta: -pointsUsed,
                tokenUsed,
                provider: input.provider,
                model: input.model,
                organizationId: input.organizationId,
                xpertId: input.xpertId,
                threadId: input.threadId,
                copilotId: input.copilotId,
                usageHour: formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
            })

            if (saved.pointsGranted && saved.pointsUsed > saved.pointsGranted) {
                exceeded = true
            }

            return ledger
        })

        if (exceeded) {
            throw new ExceedingLimitException('Membership points limit exceeded.')
        }

        return ledger
    }

    calculatePoints(tokenUsed: number, plan: MembershipPlan, provider?: string, model?: string): number {
        const tokensPerPoint = Math.max(1, Number(plan.tokensPerPoint || DEFAULT_TOKENS_PER_POINT))
        const multiplier = this.resolveModelMultiplier(plan, provider, model)
        return Math.max(1, Math.ceil((tokenUsed / tokensPerPoint) * multiplier))
    }

    private async ensureDefaultPlan(tenantId: string, manager?: EntityManager): Promise<MembershipPlan> {
        const repository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        let plan = await repository.findOne({
            where: {
                tenantId,
                isDefault: true,
                status: MembershipPlanStatusEnum.Active
            }
        })
        if (plan) {
            return plan
        }

        plan = await repository.findOne({
            where: {
                tenantId,
                code: DEFAULT_PLAN_CODE
            }
        })
        if (plan) {
            plan.isDefault = true
            plan.status = MembershipPlanStatusEnum.Active
            return repository.save(plan)
        }

        return repository.save(
            repository.create({
                tenantId,
                code: DEFAULT_PLAN_CODE,
                name: DEFAULT_PLAN_NAME,
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                period: MembershipPeriodEnum.Monthly,
                includedPoints: DEFAULT_INCLUDED_POINTS,
                tokensPerPoint: DEFAULT_TOKENS_PER_POINT,
                modelMultipliers: [],
                rateLimits: []
            })
        )
    }

    private async ensureActiveMembership(
        tenantId: string,
        userId: string,
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipWithPlan> {
        let membership = forUpdate
            ? await this.findActiveMembershipForUpdate(tenantId, userId, manager)
            : await this.findActiveMembership(tenantId, userId, manager)

        if (!membership) {
            const plan = await this.ensureDefaultPlan(tenantId, manager)
            const start = new Date()
            const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
            membership = (await repository.save(
                repository.create({
                    tenantId,
                    userId,
                    planId: plan.id,
                    status: MembershipStatusEnum.Active,
                    currentPeriodStart: start,
                    currentPeriodEnd: periodEndFor(start, plan.period),
                    pointsGranted: plan.includedPoints,
                    pointsUsed: 0,
                    pointsTotalUsed: 0
                })
            )) as MembershipWithPlan
            membership.plan = plan
            await this.createLedger(manager, {
                tenantId,
                userId,
                membershipId: membership.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Grant,
                pointsDelta: plan.includedPoints,
                reason: 'Default plan grant'
            })
        }

        if (!membership.plan) {
            membership = await this.findMembershipById(membership.id, manager)
        }

        if (new Date(membership.currentPeriodEnd).getTime() <= Date.now()) {
            membership = await this.renewMembership(membership, manager)
        }

        return membership
    }

    private async findActiveMembership(
        tenantId: string,
        userId: string,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        return (await repository.findOne({
            where: { tenantId, userId, status: MembershipStatusEnum.Active },
            relations: ['plan']
        })) as MembershipWithPlan | null
    }

    private async findActiveMembershipForUpdate(
        tenantId: string,
        userId: string,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        if (!manager) {
            return this.findActiveMembership(tenantId, userId)
        }

        const membership = (await manager
            .getRepository(UserMembership)
            .createQueryBuilder('membership')
            .leftJoinAndSelect('membership.plan', 'plan')
            .where('membership.tenantId = :tenantId', { tenantId })
            .andWhere('membership.userId = :userId', { userId })
            .andWhere('membership.status = :status', { status: MembershipStatusEnum.Active })
            .setLock('pessimistic_write', undefined, ['membership'])
            .getOne()) as MembershipWithPlan | null

        return membership
    }

    private async renewMembership(
        membership: MembershipWithPlan,
        manager?: EntityManager
    ): Promise<MembershipWithPlan> {
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const start = new Date()
        membership.pointsTotalUsed = (membership.pointsTotalUsed ?? 0) + (membership.pointsUsed ?? 0)
        membership.pointsUsed = 0
        membership.pointsGranted = membership.plan.includedPoints
        membership.currentPeriodStart = start
        membership.currentPeriodEnd = periodEndFor(start, membership.plan.period)
        const saved = (await repository.save(membership)) as MembershipWithPlan
        saved.plan = membership.plan
        await this.createLedger(manager, {
            tenantId: saved.tenantId,
            userId: saved.userId,
            membershipId: saved.id,
            planId: saved.planId,
            source: MembershipLedgerSourceEnum.Renew,
            pointsDelta: saved.pointsGranted,
            reason: 'Membership period renewed'
        })
        return saved
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

    private async clearDefaultPlan(tenantId: string, manager: EntityManager, exceptId?: string) {
        const qb = manager
            .getRepository(MembershipPlan)
            .createQueryBuilder()
            .update(MembershipPlan)
            .set({ isDefault: false })
            .where('tenantId = :tenantId', { tenantId })

        if (exceptId) {
            qb.andWhere('id != :exceptId', { exceptId })
        }

        await qb.execute()
    }

    private async assertRateLimits(membership: MembershipWithPlan, provider?: string, model?: string) {
        const limits = (membership.plan.rateLimits ?? []).filter((limit) => {
            const providerMatches = !limit.provider || limit.provider === provider
            const modelMatches = !limit.model || limit.model === model || limit.model === '*'
            return providerMatches && modelMatches
        })

        for (const limit of limits) {
            const start = this.rateLimitStart(limit.period, membership.currentPeriodStart)
            const row = await this.ledgerRepository
                .createQueryBuilder('ledger')
                .select('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .where('ledger.tenantId = :tenantId', { tenantId: membership.tenantId })
                .andWhere('ledger.userId = :userId', { userId: membership.userId })
                .andWhere('ledger.source = :source', { source: MembershipLedgerSourceEnum.Usage })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere(limit.provider ? 'ledger.provider = :provider' : '1=1', { provider: limit.provider })
                .andWhere(limit.model && limit.model !== '*' ? 'ledger.model = :model' : '1=1', { model: limit.model })
                .getRawOne<NumericRaw>()
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
                .andWhere('ledger.source = :source', { source: MembershipLedgerSourceEnum.Usage })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .andWhere(`ledger.${dimension} IS NOT NULL`)
                .groupBy(`ledger.${dimension}`)
                .orderBy('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'DESC')
                .take(5),
            query
        )

        const rows = await qb.getRawMany<NumericRaw & { key?: string }>()
        return rows.map((row) => ({
            key: row.key,
            label: row.key,
            pointsUsed: toNumber(row.pointsUsed),
            tokenUsed: toNumber(row.tokenUsed)
        }))
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

    private toMembershipMe(membership: MembershipWithPlan): IMembershipMe {
        const pointsGranted = membership.pointsGranted ?? 0
        const pointsUsed = membership.pointsUsed ?? 0
        return {
            membership,
            plan: membership.plan,
            pointsGranted,
            pointsUsed,
            pointsRemaining: Math.max(0, pointsGranted - pointsUsed),
            pointsTotalUsed: (membership.pointsTotalUsed ?? 0) + pointsUsed,
            currentPeriodStart: membership.currentPeriodStart,
            currentPeriodEnd: membership.currentPeriodEnd
        }
    }

    private pointsRemaining(membership: MembershipWithPlan) {
        return Math.max(0, (membership.pointsGranted ?? 0) - (membership.pointsUsed ?? 0))
    }

    private positiveInteger(value: unknown, fallback: number) {
        const numberValue = Number(value)
        return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : fallback
    }

    private slugify(value: string) {
        return (value || DEFAULT_PLAN_NAME)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
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

    private assertTenantScope() {
        if (RequestContext.isOrganizationScope()) {
            throw new ForbiddenException('Membership administration requires tenant scope.')
        }
    }
}
