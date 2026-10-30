import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    MembershipLedgerSourceEnum,
    MembershipPlanStatusEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TenantSetting } from '@xpert-ai/server-core'
import { EntityManager, IsNull, Repository } from 'typeorm'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { resolveMembershipPointRate } from '../membership-usage-points'
import {
    applyScopeFilter,
    hydrateMembershipPlanSnapshot,
    scopeWhere,
    toNumber,
    translateMembershipError
} from '../membership-utils'
import { MembershipWithPlan, NumericRaw } from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipRecordsService {
    constructor(
        @InjectRepository(MembershipPointLedger)
        private readonly ledgerRepository: Repository<MembershipPointLedger>,
        @InjectRepository(MembershipPlan)
        private readonly planRepository: Repository<MembershipPlan>,
        @InjectRepository(UserMembership)
        private readonly membershipRepository: Repository<UserMembership>,
        @Optional()
        @InjectRepository(TenantSetting)
        private readonly tenantSettingRepository?: Repository<TenantSetting>,
        @InjectRepository(MembershipPeriod)
        private readonly periodRepository?: Repository<MembershipPeriod>
    ) {}

    async getPersonalPointsBalance(tenantId: string, userId: string, manager?: EntityManager) {
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

    async findDefaultPlan(
        tenantId: string,
        organizationId: string | null,
        manager?: EntityManager
    ): Promise<MembershipPlan | null> {
        const repository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        return repository.findOne({
            where: {
                ...scopeWhere(tenantId, organizationId),
                status: MembershipPlanStatusEnum.Active,
                isDefault: true,
                catalogSourcePlanId: IsNull()
            }
        })
    }

    async hasActivePlan(tenantId: string, organizationId: string | null, manager?: EntityManager) {
        const repository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        if (!repository?.count) {
            return false
        }
        return (
            (await repository.count({
                where: {
                    ...scopeWhere(tenantId, organizationId),
                    status: MembershipPlanStatusEnum.Active,
                    catalogSourcePlanId: IsNull()
                }
            })) > 0
        )
    }

    async findActiveMembership(
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

        applyScopeFilter(qb, 'membership.organizationId', organizationId)
        const membership = await qb.getOne()
        return membership?.plan || membership?.planSnapshot ? hydrateMembershipPlanSnapshot(membership) : null
    }

    async findActiveMembershipForUpdate(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager
    ): Promise<MembershipWithPlan | null> {
        return this.findMembershipForUpdate(tenantId, organizationId, userId, [MembershipStatusEnum.Active], manager)
    }

    async findManagedMembershipForUpdate(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager: EntityManager
    ): Promise<MembershipWithPlan | null> {
        return this.findMembershipForUpdate(tenantId, organizationId, userId, undefined, manager)
    }

    async findMembershipForUpdate(
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

        applyScopeFilter(qb, 'membership.organizationId', organizationId)
        if (manager) {
            qb.setLock('pessimistic_write', undefined, ['membership'])
        }

        const membership = await qb.getOne()
        return membership?.plan || membership?.planSnapshot ? hydrateMembershipPlanSnapshot(membership) : null
    }

    async requireManagedMembership(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager: EntityManager
    ): Promise<MembershipWithPlan> {
        const membership = await this.findManagedMembershipForUpdate(tenantId, organizationId, userId, manager)
        if (!membership?.plan || !membership.planId) {
            throw new BadRequestException(
                translateMembershipError('server-ai:Error.MembershipNotFound', 'Membership not found.')
            )
        }
        return membership
    }

    async findMembershipById(id: string, manager?: EntityManager): Promise<MembershipWithPlan> {
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const membership = await repository.findOne({
            where: { id },
            relations: ['user', 'plan', 'assignedBy']
        })
        if (!membership) {
            throw new BadRequestException('Membership not found.')
        }
        return hydrateMembershipPlanSnapshot(membership)
    }

    async createLedger(
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

    async createMembershipStatusLedger(
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

    async clearDefaultPlan(tenantId: string, organizationId: string | null, manager: EntityManager, exceptId?: string) {
        const qb = manager
            .getRepository(MembershipPlan)
            .createQueryBuilder()
            .update(MembershipPlan)
            .set({ isDefault: false })
            .where('tenantId = :tenantId', { tenantId })

        applyScopeFilter(qb, 'organizationId', organizationId)
        qb.andWhere('catalogSourcePlanId IS NULL')

        if (exceptId) {
            qb.andWhere('id != :exceptId', { exceptId })
        }

        await qb.execute()
    }

    async assertPlanCodeAvailable(
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

        applyScopeFilter(qb, 'plan.organizationId', organizationId)

        if (exceptId) {
            qb.andWhere('plan.id != :exceptId', { exceptId })
        }

        if ((await qb.getCount()) > 0) {
            throw new BadRequestException('Membership plan code already exists.')
        }
    }

    async synchronizeAssignedPlanPoints(manager: EntityManager, plan: MembershipPlan) {
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

    async resolveTenantCnyPerPoint(tenantId: string) {
        return resolveMembershipPointRate(this.tenantSettingRepository, tenantId)
    }

    requirePeriodRepository(): Repository<MembershipPeriod> {
        if (!this.periodRepository) {
            throw new Error('Membership period repository is not available.')
        }
        return this.periodRepository
    }

    async findMembershipPeriods(
        tenantId: string,
        organizationId: string | null | undefined,
        userId: string
    ): Promise<MembershipPeriod[]> {
        const repository = this.requirePeriodRepository()
        return repository.find({
            where: {
                tenantId,
                ...(organizationId === undefined ? {} : scopeWhere(tenantId, organizationId)),
                userId
            },
            relations: ['plan'],
            order: { periodStart: 'ASC' }
        })
    }
}
