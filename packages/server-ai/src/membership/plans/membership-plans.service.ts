import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipStatusEnum,
    TMembershipPlanReassignInput,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, IsNull, Repository } from 'typeorm'
import { MembershipInitializationService } from '../initialization/membership-initialization.service'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import {
    assertDefaultPlanIsActive,
    normalizeAllowedModels,
    normalizeModelMultipliers,
    normalizeRateLimits
} from './membership-rules'
import {
    applyScopeFilter,
    DEFAULT_INCLUDED_POINTS,
    DEFAULT_PLAN_NAME,
    nonNegativeNumberOrNull,
    normalizePlanCode,
    normalizePlanName,
    periodEndFor,
    requireCurrentScope,
    scopeWhere,
    slugify,
    translateMembershipError
} from '../membership-utils'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipPlansService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        private readonly initialization: MembershipInitializationService,
        @InjectRepository(MembershipPlan)
        private readonly planRepository: Repository<MembershipPlan>,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async findPlans(): Promise<MembershipPlan[]> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        return this.planRepository.find({
            where: {
                ...scopeWhere(tenantId, organizationId),
                catalogSourcePlanId: IsNull()
            },
            order: { isDefault: 'DESC', createdAt: 'ASC' }
        })
    }

    async createPlan(input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const name = normalizePlanName(input.name, DEFAULT_PLAN_NAME)
        const code = normalizePlanCode(input.code, slugify(name) || 'plan')
        const status = input.status ?? MembershipPlanStatusEnum.Active
        const isDefault = input.isDefault ?? false
        assertDefaultPlanIsActive(status, isDefault)
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
            includedPoints: nonNegativeNumberOrNull(input.includedPoints, DEFAULT_INCLUDED_POINTS),
            allowedModels: normalizeAllowedModels(input.allowedModels),
            modelMultipliers: normalizeModelMultipliers(input.modelMultipliers),
            rateLimits: normalizeRateLimits(input.rateLimits)
        })

        const saved = await this.dataSource.transaction(async (manager) => {
            await this.records.assertPlanCodeAvailable(
                manager.getRepository(MembershipPlan),
                tenantId,
                organizationId,
                plan.code
            )
            if (plan.isDefault) {
                await this.records.clearDefaultPlan(tenantId, organizationId, manager)
            }
            return manager.getRepository(MembershipPlan).save(plan)
        })
        if (saved.status === MembershipPlanStatusEnum.Active && saved.isDefault) {
            await this.initialization.enqueueDefaultMembershipBackfill({ tenantId, organizationId })
        }
        return saved
    }

    async updatePlan(id: string, input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(MembershipPlan)
            const plan = await repository.findOne({ where: { ...scopeWhere(tenantId, organizationId), id } })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }
            if (plan.catalogSourcePlanId) {
                throw new BadRequestException(
                    translateMembershipError(
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
                    : nonNegativeNumberOrNull(input.includedPoints, DEFAULT_INCLUDED_POINTS)
            const includedPointsChanged =
                input.includedPoints !== undefined && nextIncludedPoints !== plan.includedPoints
            assertDefaultPlanIsActive(nextStatus, nextIsDefault)
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
                        translateMembershipError(
                            'server-ai:Error.MembershipPlanInUseCannotArchive',
                            'This membership plan is still assigned to users and cannot be archived.'
                        )
                    )
                }
            }

            if (input.code !== undefined) {
                const code = normalizePlanCode(input.code)
                await this.records.assertPlanCodeAvailable(repository, tenantId, organizationId, code, plan.id)
                plan.code = code
            }
            if (input.name !== undefined) {
                plan.name = normalizePlanName(input.name)
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
            if (input.allowedModels !== undefined) {
                plan.allowedModels = normalizeAllowedModels(input.allowedModels)
            }
            if (input.modelMultipliers !== undefined) {
                plan.modelMultipliers = normalizeModelMultipliers(input.modelMultipliers)
            }
            if (input.rateLimits !== undefined) {
                plan.rateLimits = normalizeRateLimits(input.rateLimits)
            }
            if (input.isDefault !== undefined) {
                plan.isDefault = input.isDefault
                if (plan.isDefault) {
                    await this.records.clearDefaultPlan(tenantId, organizationId, manager, plan.id)
                }
            }

            const saved = await repository.save(plan)
            if (includedPointsChanged) {
                await this.records.synchronizeAssignedPlanPoints(manager, saved)
            }
            return {
                saved,
                becameActiveDefault:
                    !wasActiveDefault && saved.status === MembershipPlanStatusEnum.Active && saved.isDefault
            }
        })
        if (result.becameActiveDefault) {
            await this.initialization.enqueueDefaultMembershipBackfill({ tenantId, organizationId })
        }
        return result.saved
    }

    async archivePlan(id: string): Promise<MembershipPlan> {
        return this.updatePlan(id, { status: MembershipPlanStatusEnum.Archived, isDefault: false })
    }

    async deletePlan(id: string): Promise<void> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope

        await this.dataSource.transaction(async (manager) => {
            const planRepository = manager.getRepository(MembershipPlan)
            const plan = await planRepository.findOne({
                where: { ...scopeWhere(tenantId, organizationId), id }
            })
            if (!plan) {
                throw new BadRequestException('Membership plan not found.')
            }
            if (plan.catalogSourcePlanId) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipCatalogPlanDeleteNotAllowed',
                        'Catalog-managed organization membership plans cannot be deleted directly.'
                    )
                )
            }
            if (plan.status !== MembershipPlanStatusEnum.Archived) {
                throw new BadRequestException(
                    translateMembershipError(
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
                    translateMembershipError(
                        'server-ai:Error.MembershipPlanInUseCannotDelete',
                        'This membership plan is still assigned to users and cannot be deleted.'
                    )
                )
            }

            await planRepository.remove(plan)
        })
    }

    async reassignPlanMembers(planId: string, input: TMembershipPlanReassignInput) {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        const { tenantId, organizationId } = scope
        if (planId === input.targetPlanId) {
            throw new BadRequestException(
                translateMembershipError(
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
                        ...scopeWhere(tenantId, organizationId),
                        id: planId,
                        catalogSourcePlanId: IsNull()
                    }
                }),
                planRepository.findOne({
                    where: {
                        ...scopeWhere(tenantId, organizationId),
                        id: input.targetPlanId,
                        status: MembershipPlanStatusEnum.Active,
                        catalogSourcePlanId: IsNull()
                    }
                })
            ])
            if (!sourcePlan || !targetPlan) {
                throw new BadRequestException(
                    translateMembershipError('server-ai:Error.MembershipPlanNotFound', 'Membership plan not found.')
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
            applyScopeFilter(qb, 'membership.organizationId', organizationId)
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
                await this.records.createLedger(manager, {
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
}
