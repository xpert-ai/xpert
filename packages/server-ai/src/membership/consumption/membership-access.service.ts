import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MembershipRenewalModeEnum, MembershipSourceEnum, MembershipStatusEnum } from '@xpert-ai/contracts'
import { EntityManager, Repository } from 'typeorm'
import { Xpert } from '../../xpert/xpert.entity'
import { MembershipInitializationService } from '../initialization/membership-initialization.service'
import { MembershipLifecycleService } from '../periods/membership-lifecycle.service'
import { acquirePersonalPointsLock } from '../membership-locks'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import {
    getMembershipPointsRemaining,
    normalizeScopeOrganizationId,
    requireTenant,
    requireUser,
    resolveFallbackPeriod,
    shouldSelfHealOrganizationAccess,
    toPresentationAccess,
    translateMembershipError
} from '../membership-utils'
import { BillableUserInput, MembershipModelAccess, MembershipWithPlan, XpertBillingPayer } from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipAccessService {
    constructor(
        private readonly records: MembershipRecordsService,
        private readonly policy: MembershipPolicyService,
        private readonly lifecycle: MembershipLifecycleService,
        private readonly initialization: MembershipInitializationService,
        @InjectRepository(Xpert)
        private readonly xpertRepository: Repository<Xpert>,
        @InjectRepository(UserMembership)
        private readonly membershipRepository: Repository<UserMembership>
    ) {}

    async resolveBillableUserId(input: BillableUserInput, manager?: EntityManager): Promise<string> {
        const xpertId = input.xpertId?.trim()
        if (!xpertId || input.xpertBillingPayer === XpertBillingPayer.RuntimeUser) {
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
                translateMembershipError(
                    'server-ai:Error.XpertCreatorRequiredForBilling',
                    'The Xpert creator is required before model access and usage can be billed.'
                )
            )
        }

        return creatorId
    }

    async hasConsumableBalance(access: MembershipModelAccess): Promise<boolean> {
        const pointsRemaining = getMembershipPointsRemaining(access.membership)
        if (pointsRemaining === null || pointsRemaining > 0) {
            return true
        }
        return (await this.records.getPersonalPointsBalance(access.tenantId, access.membership.userId)) > 0
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
        const tenantId = input?.tenantId ?? requireTenant()
        const organizationId = normalizeScopeOrganizationId(input?.organizationId)
        const organizationMembershipEnabled = organizationId
            ? await this.policy.isMembershipPlanEnabledForScope({ tenantId, organizationId }, manager)
            : false
        const tenantMembershipEnabled = await this.policy.isMembershipPlanEnabledForScope(
            { tenantId, organizationId: null },
            manager
        )
        if (!organizationMembershipEnabled && !tenantMembershipEnabled) {
            return null
        }
        const userId = input?.userId ?? requireUser()
        const billableUserId = await this.resolveBillableUserId(
            {
                tenantId,
                userId,
                xpertId: input?.xpertId ?? undefined
            },
            manager
        )
        if (!(await this.policy.hasMembershipUsePermission(tenantId, billableUserId))) {
            return null
        }
        if (organizationId && organizationMembershipEnabled) {
            const membership = await this.lifecycle.findUsableMembership(
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

            if (await this.records.hasActivePlan(tenantId, organizationId, manager)) {
                return this.findPersonalPointsAccess(tenantId, organizationId, billableUserId, manager, forUpdate)
            }
        }

        if (!tenantMembershipEnabled) {
            return null
        }

        const tenantMembership = await this.lifecycle.findUsableMembership(
            tenantId,
            null,
            billableUserId,
            manager,
            forUpdate
        )
        if (tenantMembership) {
            return {
                tenantId,
                organizationId: null,
                membership: tenantMembership
            }
        }

        return this.findPersonalPointsAccess(tenantId, null, billableUserId, manager, forUpdate)
    }

    async findPersonalPointsAccess(
        tenantId: string,
        organizationId: string | null,
        userId: string,
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipModelAccess | null> {
        if (forUpdate && manager) {
            await acquirePersonalPointsLock(manager, tenantId, userId)
        }
        if ((await this.records.getPersonalPointsBalance(tenantId, userId, manager)) <= 0) {
            return null
        }

        const plan = await this.records.findDefaultPlan(tenantId, organizationId, manager)
        const previousMembership = await this.records.findMembershipForUpdate(
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
        const { start, end } = resolveFallbackPeriod(fallbackMembership, plan.period)
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

    async findMembershipPresentationAccess(
        tenantId: string,
        organizationId: string | null,
        userId: string
    ): Promise<MembershipModelAccess | null> {
        const access = await this.findModelAccess({ tenantId, organizationId, userId })
        if (access) {
            return access
        }

        if (organizationId) {
            const organizationMembership = await this.records.findMembershipForUpdate(
                tenantId,
                organizationId,
                userId,
                undefined
            )
            const organizationPlan =
                organizationMembership?.plan ?? (await this.records.findDefaultPlan(tenantId, organizationId))
            if (organizationMembership && organizationPlan) {
                return toPresentationAccess(organizationMembership, organizationPlan, organizationId)
            }
            if (await this.records.hasActivePlan(tenantId, organizationId)) {
                return null
            }
        }

        const tenantMembership = await this.records.findMembershipForUpdate(tenantId, null, userId, undefined)
        const tenantPlan = tenantMembership?.plan ?? (await this.records.findDefaultPlan(tenantId, null))
        return tenantMembership && tenantPlan ? toPresentationAccess(tenantMembership, tenantPlan, null) : null
    }

    async findModelAccessWithOrganizationSelfHeal(
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
        if (!shouldSelfHealOrganizationAccess(input.organizationId, input.copilotOrganizationId)) {
            return access
        }
        if (access?.organizationId === normalizeScopeOrganizationId(input.copilotOrganizationId)) {
            return access
        }
        if (!access) {
            const billableUserId = await this.resolveBillableUserId(
                {
                    tenantId: input.tenantId,
                    userId: input.userId,
                    xpertId: input.xpertId ?? undefined
                },
                manager
            )
            if (!(await this.policy.hasMembershipUsePermission(input.tenantId, billableUserId))) {
                return null
            }
        }

        await this.initialization.ensureScopeInitialized(
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
}
