import { Injectable, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    IMembershipScopeStatus,
    MembershipLedgerSourceEnum,
    MembershipPeriodEnum,
    MembershipPlanStatusEnum,
    MembershipRenewalModeEnum,
    MembershipSourceEnum,
    MembershipStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm'
import { Copilot } from '../../copilot/copilot.entity'
import { appPlatformTrial } from '../app-platform-trial'
import { MembershipBackfillQueueService } from '../membership-backfill.queue'
import { MembershipLifecycleService } from '../periods/membership-lifecycle.service'
import {
    acquireMembershipAssignmentLock,
    acquireOrganizationDefaultPlanInitializationLock,
    acquireTenantDefaultMembershipLock,
    acquireTenantDefaultPlanInitializationLock
} from '../membership-locks'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import {
    DEFAULT_INCLUDED_POINTS,
    DEFAULT_ORGANIZATION_PLAN_GRANT_REASON,
    DEFAULT_PLAN_NAME,
    DEFAULT_TENANT_PLAN_GRANT_REASON,
    hydrateMembershipPlanSnapshot,
    periodEndFor,
    resolveScope,
    scopeWhere
} from '../membership-utils'
import {
    EnsureScopeInitializedInput,
    EnsureTenantDefaultMembershipInput,
    MembershipScope,
    ResolveScopeInput
} from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipInitializationService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        private readonly lifecycle: MembershipLifecycleService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(MembershipPlan)
        private readonly planRepository: Repository<MembershipPlan>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(UserMembership)
        private readonly membershipRepository: Repository<UserMembership>,
        @Optional()
        private readonly backfillQueueService?: MembershipBackfillQueueService,
        @Optional()
        @InjectRepository(UserOrganization)
        private readonly userOrganizationRepository?: Repository<UserOrganization>,
        @Optional()
        @InjectRepository(Copilot)
        private readonly copilotRepository?: Repository<Copilot>
    ) {}

    async getScopeStatus(input?: ResolveScopeInput, manager?: EntityManager): Promise<IMembershipScopeStatus> {
        const scope = resolveScope(input)
        await this.policy.assertMembershipPlanFeatureEnabled(scope, manager)
        return this.buildScopeStatus(scope, manager)
    }

    async ensureScopeInitialized(
        input?: EnsureScopeInitializedInput,
        manager?: EntityManager
    ): Promise<IMembershipScopeStatus> {
        const scope = resolveScope(input)
        if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
            if (!input) {
                await this.policy.assertMembershipPlanFeatureEnabled(scope, manager)
            }
            return this.buildScopeStatus(scope, manager)
        }
        if (!scope.organizationId) {
            if (!(await this.records.hasActivePlan(scope.tenantId, scope.organizationId, manager))) {
                return this.buildScopeStatus(scope, manager)
            }
            await this.enqueueTenantDefaultMembershipBackfill(scope.tenantId)
            return this.buildScopeStatus(scope, manager)
        }
        const actorUserId = input?.assignedById ?? RequestContext.currentUserId()
        if (!actorUserId || !(await this.policy.hasMembershipEditPermission(scope.tenantId, actorUserId))) {
            return this.buildScopeStatus(scope, manager)
        }
        if (!(await this.records.hasActivePlan(scope.tenantId, scope.organizationId, manager))) {
            await this.enqueueOrganizationDefaultMembershipBackfill(scope.tenantId, scope.organizationId, actorUserId)
            return this.buildScopeStatus(scope, manager)
        }

        const initialize = async (txManager: EntityManager) => {
            const plan = await this.ensureDefaultOrganizationPlan(scope, txManager)
            if (plan) {
                await this.ensureOrganizationMemberMemberships(scope, plan, actorUserId, txManager)
            }
            return this.buildScopeStatus(scope, txManager)
        }

        return manager ? initialize(manager) : this.dataSource.transaction(initialize)
    }

    async ensureUserAssignedIfScopeInitialized(input: EnsureScopeInitializedInput & { userId: string }) {
        const scope = resolveScope(input)
        if (!(await this.policy.isMembershipPlanEnabledForScope(scope))) {
            return null
        }
        if (!scope.organizationId) {
            return null
        }
        if (!(await this.policy.hasMembershipUsePermission(scope.tenantId, input.userId))) {
            return null
        }
        if (!(await this.policy.isActiveOrganizationMember(scope.tenantId, scope.organizationId, input.userId))) {
            return null
        }

        return this.dataSource.transaction(async (manager) => {
            if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
                return null
            }
            const plan = await this.records.findDefaultPlan(scope.tenantId, scope.organizationId, manager)
            if (!plan) {
                return null
            }
            return (
                await this.ensureOrganizationMemberMembershipWithPlan(
                    {
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId,
                        userId: input.userId
                    },
                    plan,
                    input.assignedById ?? input.userId,
                    manager
                )
            ).membership
        })
    }

    async enqueueOrganizationDefaultMembershipInitialization(input: {
        tenantId: string
        organizationId: string
        actorUserId?: string | null
    }): Promise<boolean> {
        const actorUserId = input.actorUserId ?? null
        if (!actorUserId || !(await this.canInitializeOrganizationDefaultMembership(input))) {
            return false
        }

        await this.enqueueOrganizationDefaultMembershipBackfill(input.tenantId, input.organizationId, actorUserId)
        return true
    }

    async canInitializeOrganizationDefaultMembership(input: {
        tenantId: string
        organizationId?: string | null
        actorUserId?: string | null
    }): Promise<boolean> {
        const actorUserId = input.actorUserId ?? null
        if (!actorUserId) {
            return false
        }
        return (
            (await this.policy.isMembershipPlanEnabledForScope({
                tenantId: input.tenantId,
                organizationId: input.organizationId ?? null
            })) && (await this.policy.hasMembershipEditPermission(input.tenantId, actorUserId))
        )
    }

    async ensureTenantDefaultMembership(
        input: EnsureTenantDefaultMembershipInput,
        manager?: EntityManager
    ): Promise<UserMembership | null> {
        const scope: MembershipScope = {
            tenantId: input.tenantId,
            organizationId: null
        }
        if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
            return null
        }
        if (!(await this.policy.hasMembershipUsePermission(scope.tenantId, input.userId))) {
            return null
        }

        const ensure = async (txManager: EntityManager) => {
            const plan = await this.records.findDefaultPlan(scope.tenantId, scope.organizationId, txManager)
            if (!plan) {
                return null
            }
            return (await this.ensureTenantDefaultMembershipWithPlan(input, plan, txManager)).membership
        }

        return manager ? ensure(manager) : this.dataSource.transaction(ensure)
    }

    async ensureTenantDefaultMembershipWithPlan(
        input: EnsureTenantDefaultMembershipInput,
        plan: MembershipPlan,
        manager: EntityManager
    ): Promise<{
        membership: UserMembership | null
        created: boolean
    }> {
        await acquireTenantDefaultMembershipLock(manager, input.tenantId, input.userId)
        const existingMembership = await this.records.findManagedMembershipForUpdate(
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

        const trial = await appPlatformTrial(manager, input.tenantId, input.userId)
        if (trial.kind === 'unverified') return { membership: null, created: false }
        const start = new Date()
        const pointsGranted = trial.kind === 'trial' ? trial.policy.creditLimit : plan.includedPoints
        const currentPeriodEnd =
            trial.kind === 'trial'
                ? new Date(start.getTime() + trial.policy.trialDays * 86_400_000)
                : periodEndFor(start, plan.period)
        const repository = manager.getRepository(UserMembership)
        const membership = await repository.save(
            repository.create({
                tenantId: input.tenantId,
                organizationId: null,
                userId: input.userId,
                planId: plan.id,
                status: MembershipStatusEnum.Active,
                source: MembershipSourceEnum.TenantDefault,
                renewalMode: trial.kind === 'trial' ? MembershipRenewalModeEnum.Manual : MembershipRenewalModeEnum.Auto,
                currentPeriodStart: start,
                currentPeriodEnd,
                pointsGranted,
                pointsUsed: 0,
                pointsTotalUsed: 0,
                note: DEFAULT_TENANT_PLAN_GRANT_REASON
            })
        )
        membership.plan = plan
        await this.records.createLedger(manager, {
            tenantId: input.tenantId,
            organizationId: null,
            userId: input.userId,
            membershipId: membership.id,
            planId: plan.id,
            source: MembershipLedgerSourceEnum.Grant,
            pointsDelta: pointsGranted ?? 0,
            reason: DEFAULT_TENANT_PLAN_GRANT_REASON
        })
        return {
            membership,
            created: true
        }
    }

    async enqueueTenantDefaultMembershipBackfill(tenantId: string) {
        await this.backfillQueueService?.enqueueTenantDefaultMembershipBackfill(tenantId)
    }

    async enqueueOrganizationDefaultMembershipBackfill(tenantId: string, organizationId: string, actorUserId: string) {
        await this.backfillQueueService?.enqueueOrganizationDefaultMembershipBackfill(
            tenantId,
            organizationId,
            actorUserId
        )
    }

    async enqueueDefaultMembershipBackfill(scope: MembershipScope) {
        if (scope.organizationId) {
            const actorUserId = RequestContext.currentUserId()
            if (actorUserId) {
                await this.enqueueOrganizationDefaultMembershipBackfill(
                    scope.tenantId,
                    scope.organizationId,
                    actorUserId
                )
            }
        } else {
            await this.enqueueTenantDefaultMembershipBackfill(scope.tenantId)
        }
    }

    async ensureDefaultTenantPlanForEmptyScope(tenantId: string): Promise<MembershipPlan | null> {
        const scope: MembershipScope = { tenantId, organizationId: null }
        return this.dataSource.transaction(async (manager) => {
            await acquireTenantDefaultPlanInitializationLock(manager, tenantId)
            if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
                return null
            }

            const defaultPlan = await this.records.findDefaultPlan(tenantId, null, manager)
            if (defaultPlan) {
                return defaultPlan
            }

            const repository = manager.getRepository(MembershipPlan)
            const existingPlans = await repository.find({
                where: {
                    ...scopeWhere(tenantId, null),
                    catalogSourcePlanId: IsNull()
                },
                take: 1
            })
            if (existingPlans.length) {
                return null
            }

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
                    allowedModels: [],
                    modelMultipliers: [],
                    rateLimits: []
                })
            )
        })
    }

    async buildScopeStatus(scope: MembershipScope, manager?: EntityManager): Promise<IMembershipScopeStatus> {
        const planRepository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        const [plans, defaultPlan] = await Promise.all([
            planRepository.find({
                where: {
                    ...scopeWhere(scope.tenantId, scope.organizationId),
                    catalogSourcePlanId: IsNull()
                },
                order: { isDefault: 'DESC', createdAt: 'ASC' }
            }),
            this.records.findDefaultPlan(scope.tenantId, scope.organizationId, manager)
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

    async ensureDefaultOrganizationPlan(
        scope: MembershipScope & { organizationId: string },
        manager: EntityManager
    ): Promise<MembershipPlan | null> {
        await acquireOrganizationDefaultPlanInitializationLock(manager, scope.tenantId, scope.organizationId)
        const repository = manager.getRepository(MembershipPlan)
        const existingDefaultPlan = await this.records.findDefaultPlan(scope.tenantId, scope.organizationId, manager)
        if (existingDefaultPlan) {
            return existingDefaultPlan
        }

        const activePlan = await repository.findOne({
            where: {
                ...scopeWhere(scope.tenantId, scope.organizationId),
                status: MembershipPlanStatusEnum.Active,
                catalogSourcePlanId: IsNull()
            },
            order: { createdAt: 'ASC' }
        })
        if (activePlan) {
            await this.records.clearDefaultPlan(scope.tenantId, scope.organizationId, manager, activePlan.id)
            activePlan.isDefault = true
            return repository.save(activePlan)
        }

        const archivedDefaultPlan = await repository.findOne({
            where: {
                ...scopeWhere(scope.tenantId, scope.organizationId),
                code: 'default',
                catalogSourcePlanId: IsNull()
            }
        })
        if (archivedDefaultPlan) {
            await this.records.clearDefaultPlan(scope.tenantId, scope.organizationId, manager, archivedDefaultPlan.id)
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
            allowedModels: [],
            modelMultipliers: [],
            rateLimits: []
        })
        await this.records.clearDefaultPlan(scope.tenantId, scope.organizationId, manager)
        return repository.save(plan)
    }

    async ensureOrganizationMemberMemberships(
        scope: MembershipScope,
        plan: MembershipPlan,
        assignedById: string | null,
        manager: EntityManager
    ) {
        if (!scope.organizationId) {
            return
        }

        const activeUserIds = await this.findActiveOrganizationUserIds(scope.tenantId, scope.organizationId, manager)
        const userIds = await this.policy.findMembershipUsePermissionUserIds(scope.tenantId, activeUserIds)
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

    async ensureOrganizationMemberMembershipWithPlan(
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
        await acquireMembershipAssignmentLock(manager, input.tenantId, input.organizationId, input.userId)
        const existingMembership = await this.records.findMembershipForUpdate(
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
        await this.lifecycle.ensureCurrentPeriodRecord(hydrateMembershipPlanSnapshot(membership), manager)
        await this.records.createLedger(manager, {
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

    async findActiveOrganizationUserIds(
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

    async countAssignedOrganizationMemberships(scope: MembershipScope, userIds: string[], manager?: EntityManager) {
        if (!scope.organizationId || !userIds.length) {
            return 0
        }
        const repository = manager?.getRepository(UserMembership) ?? this.membershipRepository
        const memberships = await repository.find({
            select: ['userId'],
            where: {
                ...scopeWhere(scope.tenantId, scope.organizationId),
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
}
