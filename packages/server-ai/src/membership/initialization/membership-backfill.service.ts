import { Injectable, Optional } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { UserType } from '@xpert-ai/contracts'
import { Organization, User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource, In, MoreThan, Repository } from 'typeorm'
import { MembershipInitializationService } from './membership-initialization.service'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import { scopeWhere } from '../membership-utils'
import { MembershipScope } from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipBackfillService {
    constructor(
        private readonly initialization: MembershipInitializationService,
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @Optional()
        @InjectRepository(UserOrganization)
        private readonly userOrganizationRepository?: Repository<UserOrganization>,
        @InjectRepository(Organization)
        private readonly organizationRepository?: Repository<Organization>
    ) {}

    async backfillTenantDefaultMembershipBatch(input: {
        tenantId: string
        afterUserId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }> {
        const scope: MembershipScope = {
            tenantId: input.tenantId,
            organizationId: null
        }
        const defaultPlan = await this.initialization.ensureDefaultTenantPlanForEmptyScope(input.tenantId)
        if (!defaultPlan) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }
        const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), 500)
        const users = await this.userRepository.find({
            select: ['id'],
            where: {
                tenantId: input.tenantId,
                type: UserType.USER,
                ...(input.afterUserId ? { id: MoreThan(input.afterUserId) } : {})
            },
            order: { id: 'ASC' },
            take: take + 1
        })
        const batch = users.slice(0, take)
        if (!batch.length) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }
        const userIds = batch.map((user) => user.id)
        const permittedUserIds = new Set(await this.policy.findMembershipUsePermissionUserIds(input.tenantId, userIds))
        const nextCursor = users.length > take ? userIds[userIds.length - 1] : null

        const result = await this.dataSource.transaction(async (manager) => {
            if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
                return { assigned: 0, canContinue: false }
            }
            const plan = await this.records.findDefaultPlan(input.tenantId, null, manager)
            if (!plan) {
                return { assigned: 0, canContinue: false }
            }

            const existingMemberships = await manager.getRepository(UserMembership).find({
                select: ['userId'],
                where: {
                    ...scopeWhere(input.tenantId, null),
                    userId: In(userIds)
                }
            })
            const existingUserIds = new Set(existingMemberships.map((membership) => membership.userId))
            let created = 0

            for (const userId of userIds) {
                if (existingUserIds.has(userId) || !permittedUserIds.has(userId)) {
                    continue
                }
                const assignment = await this.initialization.ensureTenantDefaultMembershipWithPlan(
                    {
                        tenantId: input.tenantId,
                        userId
                    },
                    plan,
                    manager
                )
                if (assignment.created) {
                    created++
                }
            }
            return { assigned: created, canContinue: true }
        })

        return {
            scanned: batch.length,
            assigned: result.assigned,
            nextCursor: result.canContinue ? nextCursor : null
        }
    }

    async backfillOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        organizationId: string
        actorUserId: string
        afterUserOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }> {
        const scope: MembershipScope = {
            tenantId: input.tenantId,
            organizationId: input.organizationId
        }
        if (!(await this.policy.hasMembershipEditPermission(input.tenantId, input.actorUserId))) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }
        const defaultPlan = await this.dataSource.transaction(async (manager) => {
            if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
                return null
            }
            return this.initialization.ensureDefaultOrganizationPlan(scope, manager)
        })
        if (!defaultPlan || !this.userOrganizationRepository?.find) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }

        const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), 500)
        const organizationMemberships = await this.userOrganizationRepository.find({
            select: ['id', 'userId'],
            where: {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                isActive: true,
                ...(input.afterUserOrganizationId ? { id: MoreThan(input.afterUserOrganizationId) } : {})
            },
            order: { id: 'ASC' },
            take: take + 1
        })
        const batch = organizationMemberships.slice(0, take)
        if (!batch.length) {
            return { scanned: 0, assigned: 0, nextCursor: null }
        }

        const candidateUserIds = Array.from(new Set(batch.map((membership) => membership.userId).filter(Boolean)))
        const permittedUserIds = await this.policy.findMembershipUsePermissionUserIds(input.tenantId, candidateUserIds)
        const nextCursor = organizationMemberships.length > take ? (batch[batch.length - 1]?.id ?? null) : null

        const result = await this.dataSource.transaction(async (manager) => {
            if (!(await this.policy.isMembershipPlanEnabledForScope(scope, manager))) {
                return { assigned: 0, canContinue: false }
            }
            const plan = await this.records.findDefaultPlan(input.tenantId, input.organizationId, manager)
            if (!plan) {
                return { assigned: 0, canContinue: false }
            }

            const activeOrganizationMemberships = permittedUserIds.length
                ? await manager.getRepository(UserOrganization).find({
                      select: ['userId'],
                      where: {
                          tenantId: input.tenantId,
                          organizationId: input.organizationId,
                          userId: In(permittedUserIds),
                          isActive: true
                      }
                  })
                : []
            const activeUserIds = new Set(activeOrganizationMemberships.map((membership) => membership.userId))
            let created = 0
            for (const userId of permittedUserIds) {
                if (!activeUserIds.has(userId)) {
                    continue
                }
                const assignment = await this.initialization.ensureOrganizationMemberMembershipWithPlan(
                    {
                        tenantId: input.tenantId,
                        organizationId: input.organizationId,
                        userId
                    },
                    plan,
                    null,
                    manager
                )
                if (assignment.created) {
                    created++
                }
            }
            return { assigned: created, canContinue: true }
        })

        return {
            scanned: batch.length,
            assigned: result.assigned,
            nextCursor: result.canContinue ? nextCursor : null
        }
    }

    async backfillTenantOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        actorUserId: string
        afterOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        enqueued: number
        nextCursor: string | null
    }> {
        const tenantScope: MembershipScope = { tenantId: input.tenantId, organizationId: null }
        if (
            !this.organizationRepository?.find ||
            !(await this.policy.isMembershipPlanEnabledForScope(tenantScope)) ||
            !(await this.policy.hasMembershipEditPermission(input.tenantId, input.actorUserId))
        ) {
            return { scanned: 0, enqueued: 0, nextCursor: null }
        }

        const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), 500)
        const organizations = await this.organizationRepository.find({
            select: ['id'],
            where: {
                tenantId: input.tenantId,
                isActive: true,
                ...(input.afterOrganizationId ? { id: MoreThan(input.afterOrganizationId) } : {})
            },
            order: { id: 'ASC' },
            take: take + 1
        })
        const batch = organizations.slice(0, take)
        const nextCursor = organizations.length > take ? (batch[batch.length - 1]?.id ?? null) : null

        for (const organization of batch) {
            await this.initialization.enqueueOrganizationDefaultMembershipBackfill(
                input.tenantId,
                organization.id,
                input.actorUserId
            )
        }

        return {
            scanned: batch.length,
            enqueued: batch.length,
            nextCursor
        }
    }
}
