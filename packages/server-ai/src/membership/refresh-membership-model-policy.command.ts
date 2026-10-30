import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { AIPermissionsEnum, MembershipPeriodStatusEnum, MembershipStatusEnum } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { EntityManager, IsNull } from 'typeorm'
import { t } from 'i18next'
import { UserMembership } from './user-membership.entity'
import { MembershipPeriod } from './membership-period.entity'
import { acquireTenantDefaultMembershipLock } from './membership-locks'
import { createMembershipPlanSnapshot } from './membership-plan-snapshot'
import { userHasPermission } from '../shared/service-operation'

/** Explicit operator adoption of a plan's current model policy; never renews or refills membership. */
export class RefreshMembershipModelPolicyCommand {
    constructor(readonly input: { tenantId: string; userId: string; actorId: string; planCode: string }, readonly manager: EntityManager) {}
}

@CommandHandler(RefreshMembershipModelPolicyCommand)
export class RefreshMembershipModelPolicyHandler implements ICommandHandler<RefreshMembershipModelPolicyCommand> {
    async execute({ input, manager }: RefreshMembershipModelPolicyCommand): Promise<void> {
        if (!manager.queryRunner?.isTransactionActive) throw new ConflictException(t('server-ai:Error.MembershipPolicyTransactionRequired'))
        const actor = await manager.getRepository(User).findOne({ where: { id: input.actorId, tenantId: input.tenantId }, relations: ['role', 'role.rolePermissions'] })
        if (!actor || !userHasPermission(actor, AIPermissionsEnum.MEMBERSHIP_EDIT)) throw new ForbiddenException()
        await acquireTenantDefaultMembershipLock(manager, input.tenantId, input.userId)
        const memberships = manager.getRepository(UserMembership)
        const membership = await memberships.findOne({ where: {
            tenantId: input.tenantId, userId: input.userId, organizationId: IsNull(), status: MembershipStatusEnum.Active
        }, relations: ['plan'], order: { currentPeriodStart: 'DESC' } })
        if (!membership?.plan || membership.plan.code !== input.planCode) throw new ConflictException(t('server-ai:Error.MembershipPolicyPlanMigrationRequired'))
        const periods = manager.getRepository(MembershipPeriod)
        const period = await periods.findOne({ where: {
            tenantId: input.tenantId, membershipId: membership.id, status: MembershipPeriodStatusEnum.Active
        }, order: { periodStart: 'DESC' } })
        // A new, unused trial has no period until its first consumption. Preserve that lazy lifecycle.
        if (period ? period.planId !== membership.planId : await periods.existsBy({
            tenantId: input.tenantId, membershipId: membership.id
        })) throw new ConflictException(t('server-ai:Error.MembershipPolicyPeriodUnavailable'))
        const allowedModels = membership.plan.allowedModels?.map((rule) => ({ ...rule }))
        const snapshot = membership.planSnapshot ?? createMembershipPlanSnapshot(membership.plan)
        // Update only model permissions. Pricing, counters, renewal dates and history are immutable here.
        await memberships.update(membership.id, { planSnapshot: { ...snapshot, allowedModels } })
        if (period) await periods.update(period.id, { planSnapshot: { ...period.planSnapshot, allowedModels } })
    }
}
