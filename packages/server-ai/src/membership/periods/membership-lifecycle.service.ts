import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    MembershipLedgerSourceEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum
} from '@xpert-ai/contracts'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { acquireMembershipAssignmentLock } from '../membership-locks'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import {
    applyScopeFilter,
    createPlanSnapshot,
    hydrateMembershipPlanSnapshot,
    periodEndFor,
    planFromSnapshot,
    translateMembershipError
} from '../membership-utils'
import { MembershipPeriodSettlementResult, MembershipWithPlan } from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipLifecycleService {
    constructor(
        private readonly records: MembershipRecordsService,
        private readonly policy: MembershipPolicyService,
        @InjectRepository(UserMembership)
        private readonly membershipRepository: Repository<UserMembership>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(MembershipPeriod)
        private readonly periodRepository?: Repository<MembershipPeriod>
    ) {}

    async findUsableMembership(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipWithPlan | null> {
        let membership = forUpdate
            ? await this.records.findActiveMembershipForUpdate(tenantId, organizationId, userId, manager)
            : await this.records.findActiveMembership(tenantId, organizationId, userId, manager)

        if (!membership) {
            return null
        }

        membership = hydrateMembershipPlanSnapshot(membership)

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
                await this.records.createMembershipStatusLedger(manager, membership, 'Manual membership expired')
                return null
            }
            membership = await this.renewMembership(membership, manager)
        }

        return membership
    }

    async synchronizePlanAllowanceType(
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
        await this.records.createLedger(manager, {
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

    async activateScheduledPeriod(
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
            currentMembership.plan = planFromSnapshot(
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
            await this.records.createLedger(txManager, {
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
            await acquireMembershipAssignmentLock(
                txManager,
                membership.tenantId,
                membership.organizationId ?? null,
                membership.userId
            )
            const lockedMembership = await this.records.findMembershipForUpdate(
                membership.tenantId,
                membership.organizationId ?? null,
                membership.userId,
                [MembershipStatusEnum.Active],
                txManager
            )
            return lockedMembership ? activate(lockedMembership, txManager) : null
        })
    }

    async ensureCurrentPeriodRecord(membership: MembershipWithPlan, manager: EntityManager): Promise<MembershipPeriod> {
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

        const snapshot = membership.planSnapshot ?? createPlanSnapshot(membership.plan)
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

    async synchronizeCurrentPeriodProjection(membership: MembershipWithPlan, manager: EntityManager) {
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
                planSnapshot: membership.planSnapshot ?? createPlanSnapshot(membership.plan)
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
            period.planSnapshot = membership.planSnapshot ?? createPlanSnapshot(membership.plan)
        }
        await repository.save(period)
    }

    async cancelScheduledMembershipPeriods(
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
                translateMembershipError(
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

    async completeCurrentMembershipPeriod(membership: UserMembership, manager: EntityManager) {
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

    async renewMembership(membership: MembershipWithPlan, manager?: EntityManager): Promise<MembershipWithPlan> {
        if (!manager) {
            return this.dataSource.transaction(async (txManager) => {
                await acquireMembershipAssignmentLock(
                    txManager,
                    membership.tenantId,
                    membership.organizationId ?? null,
                    membership.userId
                )
                const lockedMembership = await this.records.findMembershipForUpdate(
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
                translateMembershipError(
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
                planSnapshot: saved.planSnapshot ?? createPlanSnapshot(saved.plan)
            })
        )
        await this.records.createLedger(manager, {
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

    async expireDuplicateManagedMemberships(
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

        applyScopeFilter(qb, 'membership.organizationId', organizationId)
        const duplicates = await qb.getMany()
        for (const duplicate of duplicates) {
            duplicate.status = MembershipStatusEnum.Expired
            await repository.save(duplicate)
            await this.completeCurrentMembershipPeriod(duplicate, manager)
            await this.cancelScheduledMembershipPeriods(duplicate.id, manager)
            await this.records.createLedger(manager, {
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

    async requireActiveMembership(
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
            if (!(await this.policy.isMembershipPlanEnabledForScope(scope))) {
                result.skipped++
                continue
            }

            try {
                const settled = await this.dataSource.transaction(async (manager) => {
                    await acquireMembershipAssignmentLock(
                        manager,
                        candidate.tenantId,
                        candidate.organizationId ?? null,
                        candidate.userId
                    )
                    const membership = await this.records.findMembershipForUpdate(
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
}
