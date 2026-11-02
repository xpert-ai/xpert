import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    IMembershipAdminUser,
    IMembershipAdminUsersQuery,
    IMembershipBulkActionResult,
    IPagination,
    MembershipAdminUserStatusEnum,
    MembershipBulkActionEnum,
    MembershipLedgerSourceEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    TMembershipAssignInput,
    TMembershipBulkActionInput,
    TMembershipPointAdjustInput,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { getErrorMessage } from '@xpert-ai/server-common'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { Brackets, DataSource, IsNull, Repository } from 'typeorm'
import { MembershipLifecycleService } from '../periods/membership-lifecycle.service'
import { acquireMembershipAssignmentLock } from '../membership-locks'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPeriodsService } from '../periods/membership-periods.service'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { MembershipPolicyService } from './membership-policy.service'
import { MembershipRecordsService } from './membership-records.service'
import { assertAdminPeriodGrantAllowed } from '../plans/membership-rules'
import {
    applyScopeFilter,
    hydrateMembershipPlanSnapshot,
    periodEndFor,
    requireCurrentScope,
    requireNonZeroPointDelta,
    scopeWhere,
    translateMembershipError
} from '../membership-utils'
import { MembershipAdminUserRow, MembershipWithPlan } from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipAdminService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        private readonly lifecycle: MembershipLifecycleService,
        private readonly periods: MembershipPeriodsService,
        @InjectRepository(UserMembership)
        private readonly membershipRepository: Repository<UserMembership>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(MembershipPointLedger)
        private readonly ledgerRepository: Repository<MembershipPointLedger>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(MembershipPeriod)
        private readonly periodRepository?: Repository<MembershipPeriod>
    ) {}

    async findAdminUsers(options?: {
        userId?: string
        planId?: string
        take?: number
        skip?: number
    }): Promise<IPagination<UserMembership>> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
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

        applyScopeFilter(qb, 'membership.organizationId', organizationId)

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
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        if (scope.organizationId) {
            throw new ForbiddenException()
        }
        await this.policy.assertMembershipEligibleUser(scope.tenantId, userId)

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
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
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
                expiringBefore: await this.policy.normalizeAdminExpiringBefore(options.expiringBefore, tenantId)
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
            applyScopeFilter(countRows, 'period.organizationId', organizationId)
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
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const userIds = [...new Set(input.userIds)]
        if (!userIds.length || userIds.length > 100) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.MembershipBulkSelectionInvalid',
                    'Select between 1 and 100 users.'
                )
            )
        }
        if (input.action === MembershipBulkActionEnum.Assign && !input.planId) {
            throw new BadRequestException(
                translateMembershipError(
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
                                translateMembershipError(
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
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        await this.policy.assertMembershipEligibleUser(scope.tenantId, userId)
        if (scope.organizationId) {
            await this.policy.assertActiveOrganizationMember(scope.tenantId, scope.organizationId, userId)
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
            applyScopeFilter(query, 'ledger.organizationId', scope.organizationId)
        }
        const [items, total] = await query.orderBy('ledger.createdAt', 'DESC').take(take).skip(skip).getManyAndCount()
        return { items, total }
    }

    async assignUser(userId: string, input: TMembershipAssignInput): Promise<UserMembership> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const assignedById = RequestContext.currentUserId()
        await this.policy.assertMembershipEligibleUser(tenantId, userId)

        return this.dataSource.transaction(async (manager) => {
            if (organizationId) {
                await this.policy.assertActiveOrganizationMember(tenantId, organizationId, userId, manager)
            }

            const plan = await manager.getRepository(MembershipPlan).findOne({
                where: {
                    ...scopeWhere(tenantId, organizationId),
                    id: input.planId,
                    status: MembershipPlanStatusEnum.Active,
                    catalogSourcePlanId: IsNull()
                }
            })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }

            await acquireMembershipAssignmentLock(manager, tenantId, organizationId, userId)
            const membership = await this.records.findMembershipForUpdate(
                tenantId,
                organizationId,
                userId,
                [MembershipStatusEnum.Active, MembershipStatusEnum.Paused],
                manager
            )
            if (membership) {
                assertAdminPeriodGrantAllowed(membership)
            }
            const start = input.currentPeriodStart ? new Date(input.currentPeriodStart) : new Date()
            const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : periodEndFor(start, plan.period)
            if (end.getTime() <= start.getTime()) {
                throw new BadRequestException(
                    translateMembershipError(
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
            await this.lifecycle.synchronizeCurrentPeriodProjection(hydrateMembershipPlanSnapshot(saved), manager)
            await this.lifecycle.expireDuplicateManagedMemberships(tenantId, organizationId, userId, saved.id, manager)
            await this.records.createLedger(manager, {
                tenantId,
                organizationId,
                userId,
                membershipId: saved.id,
                planId: plan.id,
                source: MembershipLedgerSourceEnum.Assignment,
                pointsDelta: plan.includedPoints ?? 0,
                reason: input.note ?? null
            })

            return this.records.findMembershipById(saved.id, manager)
        })
    }

    async adjustUserPoints(userId: string, input: TMembershipPointAdjustInput): Promise<UserMembership> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const pointDelta = requireNonZeroPointDelta(input.pointDelta)

        return this.dataSource.transaction(async (manager) => {
            const membership = await this.lifecycle.requireActiveMembership(
                tenantId,
                organizationId,
                userId,
                manager,
                true
            )
            if (membership.pointsGranted === null) {
                throw new BadRequestException('Cannot adjust points for an unlimited membership.')
            }
            const previousPointsGranted = membership.pointsGranted ?? 0
            membership.pointsGranted = Math.max(0, previousPointsGranted + pointDelta)
            const appliedDelta = membership.pointsGranted - previousPointsGranted
            const saved = await manager.getRepository(UserMembership).save(membership)
            await this.lifecycle.synchronizeCurrentPeriodProjection(hydrateMembershipPlanSnapshot(saved), manager)
            await this.records.createLedger(manager, {
                tenantId,
                organizationId,
                userId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Adjustment,
                pointsDelta: appliedDelta,
                reason: input.reason ?? null
            })
            return this.records.findMembershipById(saved.id, manager)
        })
    }

    async renewUser(userId: string): Promise<UserMembership> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            const membership = await this.records.requireManagedMembership(tenantId, organizationId, userId, manager)
            assertAdminPeriodGrantAllowed(membership)
            if (
                membership.status === MembershipStatusEnum.Paused &&
                new Date(membership.currentPeriodEnd).getTime() > Date.now()
            ) {
                membership.status = MembershipStatusEnum.Active
                await manager.getRepository(UserMembership).save(membership)
                await this.records.createMembershipStatusLedger(manager, membership, 'Membership resumed by renewal')
            }
            await this.periods.appendMembershipPeriods(
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
            return this.records.findMembershipById(membership.id, manager)
        })
    }

    async pauseUser(userId: string): Promise<UserMembership> {
        return this.changeMembershipStatus(userId, MembershipStatusEnum.Paused)
    }

    async resumeUser(userId: string): Promise<UserMembership> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            let membership = await this.records.requireManagedMembership(tenantId, organizationId, userId, manager)
            if (membership.status !== MembershipStatusEnum.Paused) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipMustBePaused',
                        'Only a paused membership can be resumed.'
                    )
                )
            }
            if (new Date(membership.currentPeriodEnd).getTime() <= Date.now()) {
                const activated = await this.lifecycle.activateScheduledPeriod(membership, manager)
                if (activated) {
                    membership = activated
                } else {
                    assertAdminPeriodGrantAllowed(membership)
                    membership = await this.lifecycle.renewMembership(membership, manager)
                }
            } else {
                membership.status = MembershipStatusEnum.Active
                await manager.getRepository(UserMembership).save(membership)
                await this.records.createMembershipStatusLedger(manager, membership, 'Membership resumed')
            }
            return this.records.findMembershipById(membership.id, manager)
        })
    }

    async revokeUser(userId: string): Promise<UserMembership> {
        return this.changeMembershipStatus(userId, MembershipStatusEnum.Expired)
    }

    async changeMembershipStatus(userId: string, targetStatus: MembershipStatusEnum) {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.dataSource.transaction(async (manager) => {
            const membership = await this.records.requireManagedMembership(tenantId, organizationId, userId, manager)
            const valid =
                (targetStatus === MembershipStatusEnum.Paused && membership.status === MembershipStatusEnum.Active) ||
                (targetStatus === MembershipStatusEnum.Expired &&
                    [MembershipStatusEnum.Active, MembershipStatusEnum.Paused].includes(membership.status))
            if (!valid) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.InvalidMembershipStatusTransition',
                        'The membership status cannot be changed this way.'
                    )
                )
            }

            membership.status = targetStatus
            if (targetStatus === MembershipStatusEnum.Expired) {
                membership.currentPeriodEnd = new Date()
                await this.lifecycle.completeCurrentMembershipPeriod(membership, manager)
                await this.lifecycle.cancelScheduledMembershipPeriods(membership.id, manager, {
                    preserveExternallyManaged: true
                })
            }
            await manager.getRepository(UserMembership).save(membership)
            await this.records.createMembershipStatusLedger(
                manager,
                membership,
                targetStatus === MembershipStatusEnum.Paused ? 'Membership paused' : 'Membership revoked'
            )
            return this.records.findMembershipById(membership.id, manager)
        })
    }

    async revokeOrganizationMembershipForRemovedUser(input: {
        tenantId: string
        organizationId: string
        userId: string
    }): Promise<UserMembership | null> {
        return this.dataSource.transaction(async (manager) => {
            await acquireMembershipAssignmentLock(manager, input.tenantId, input.organizationId, input.userId)
            const membership = await this.records.findMembershipForUpdate(
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
            await this.lifecycle.completeCurrentMembershipPeriod(saved, manager)
            await this.lifecycle.cancelScheduledMembershipPeriods(saved.id, manager, {
                preserveExternallyManaged: true
            })
            await this.records.createMembershipStatusLedger(manager, saved, 'Organization membership removed')
            return saved
        })
    }
}
