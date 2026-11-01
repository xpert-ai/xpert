import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
    IMembershipPlan,
    IMembershipPlanSnapshot,
    MembershipLedgerSourceEnum,
    MembershipPeriodStatusEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    TMembershipCurrentPeriodUpgradeInput,
    TMembershipOrganizationPurchasePlanInput,
    TMembershipPeriodsAppendInput
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, EntityManager, In } from 'typeorm'
import { MembershipLifecycleService } from './membership-lifecycle.service'
import { acquireMembershipAssignmentLock } from '../membership-locks'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import {
    copyPlanSnapshot,
    createPlanSnapshot,
    hydrateMembershipPlanSnapshot,
    normalizeScopeOrganizationId,
    periodEndFor,
    requireCurrentScope,
    requireNonNegativePointDelta,
    scopeWhere,
    translateMembershipError
} from '../membership-utils'
import { MembershipWithPlan } from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipPeriodsService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        private readonly lifecycle: MembershipLifecycleService,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async appendMembershipPeriods(
        input: TMembershipPeriodsAppendInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        const append = (txManager: EntityManager) => this.appendMembershipPeriodsInTransaction(input, txManager)
        return manager ? append(manager) : this.dataSource.transaction(append)
    }

    async appendMembershipPeriodsInTransaction(
        input: TMembershipPeriodsAppendInput,
        manager: EntityManager
    ): Promise<MembershipPeriod[]> {
        if (!Number.isInteger(input.count) || input.count < 1 || input.count > 120) {
            throw new BadRequestException('Membership period count must be an integer between 1 and 120.')
        }

        const organizationId = normalizeScopeOrganizationId(input.organizationId)
        const sourceReference = input.sourceReference?.trim() || null
        const source = input.source ?? MembershipSourceEnum.External
        if (source === MembershipSourceEnum.External && !sourceReference) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.ExternalMembershipPeriodReferenceRequired',
                    'Externally managed membership periods require a source reference.'
                )
            )
        }
        await this.policy.assertMembershipEligibleUser(input.tenantId, input.userId)
        if (organizationId) {
            await this.policy.assertActiveOrganizationMember(input.tenantId, organizationId, input.userId, manager)
        }
        await acquireMembershipAssignmentLock(manager, input.tenantId, organizationId, input.userId)

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
            ? copyPlanSnapshot(input.planSnapshot, input.planId)
            : createPlanSnapshot(plan)
        let membership = await this.records.findMembershipForUpdate(
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
            membership = hydrateMembershipPlanSnapshot(membership)
            await this.lifecycle.ensureCurrentPeriodRecord(membership, manager)
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
            await this.records.createLedger(manager, {
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
            await this.records.createLedger(manager, {
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

    async resolveOrganizationPurchasePlan(
        input: TMembershipOrganizationPurchasePlanInput,
        manager?: EntityManager
    ): Promise<MembershipPlan> {
        const resolve = async (txManager: EntityManager) => {
            if (!input.organizationId) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipOrganizationPurchaseScopeRequired',
                        'Organization purchase scope is required.'
                    )
                )
            }
            if (input.planSnapshot.planId !== input.catalogSourcePlanId) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipCatalogSnapshotMismatch',
                        'Catalog membership plan snapshot does not match its source plan.'
                    )
                )
            }
            await this.policy.assertActiveOrganizationMember(
                input.tenantId,
                input.organizationId,
                input.userId,
                txManager
            )
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
            const organizationId = normalizeScopeOrganizationId(input.organizationId)
            const sourceReference = input.sourceReference.trim()
            if (!sourceReference) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipUpgradeSourceReferenceRequired',
                        'Membership upgrade source reference is required.'
                    )
                )
            }
            const pointsDelta = requireNonNegativePointDelta(input.pointsDelta)
            await this.policy.assertMembershipEligibleUser(input.tenantId, input.userId)
            await acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)

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
                    translateMembershipError(
                        'server-ai:Error.MembershipUpgradeFulfillmentMismatch',
                        'Membership upgrade request does not match the existing fulfillment.'
                    )
                )
            }
            if (existingLedger?.membershipId) {
                return this.records.findMembershipById(existingLedger.membershipId, txManager)
            }

            const membership = await this.lifecycle.requireActiveMembership(
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
                ? copyPlanSnapshot(input.planSnapshot, input.planId)
                : createPlanSnapshot(plan)
            const period = await this.lifecycle.ensureCurrentPeriodRecord(membership, txManager)

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
            await this.records.createLedger(txManager, {
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
            return this.records.findMembershipById(membership.id, txManager)
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
            const organizationId = normalizeScopeOrganizationId(input.organizationId)
            await acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const membership = await this.records.findMembershipForUpdate(
                input.tenantId,
                organizationId,
                input.userId,
                [MembershipStatusEnum.Active],
                txManager
            )
            if (!membership || membership.id !== input.membershipId) {
                throw new BadRequestException(
                    translateMembershipError('server-ai:Error.MembershipNotFound', 'Membership not found.')
                )
            }
            return this.lifecycle.ensureCurrentPeriodRecord(membership, txManager)
        }

        return manager ? ensure(manager) : this.dataSource.transaction(ensure)
    }

    async findMyPeriods(): Promise<MembershipPeriod[]> {
        const scope = requireCurrentScope()
        return this.records.findMembershipPeriods(scope.tenantId, scope.organizationId, RequestContext.currentUserId())
    }

    async findAdminUserPeriods(userId: string): Promise<MembershipPeriod[]> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        await this.policy.assertMembershipEligibleUser(scope.tenantId, userId)
        return this.records.findMembershipPeriods(scope.tenantId, scope.organizationId || undefined, userId)
    }

    async resolvePeriodPlan(
        tenantId: string,
        organizationId: string | null,
        planId: string,
        snapshot: IMembershipPlanSnapshot | undefined,
        manager: EntityManager
    ): Promise<IMembershipPlan> {
        if (snapshot?.planId && snapshot.planId !== planId) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.MembershipPlanSnapshotMismatch',
                    'Membership plan snapshot does not match the requested plan.'
                )
            )
        }
        const plan = await manager.getRepository(MembershipPlan).findOne({
            where: {
                ...scopeWhere(tenantId, organizationId),
                id: planId
            }
        })
        if (plan) {
            if (!snapshot && plan.status !== MembershipPlanStatusEnum.Active) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipPlanInactive',
                        'Archived membership plans cannot be renewed.'
                    )
                )
            }
            return plan
        }
        throw new BadRequestException('Membership plan not found.')
    }
}
