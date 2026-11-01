import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { AiFeatureEnum, AIPermissionsEnum, MembershipPlanStatusEnum, UserType } from '@xpert-ai/contracts'
import { FeatureOrganization, Organization, User, UserOrganization } from '@xpert-ai/server-core'
import { EntityManager, In, Repository } from 'typeorm'
import { endOfDayInTimeZone } from '../../shared/utils'
import { MembershipPlan } from '../membership-plan.entity'
import {
    applyScopeFilter,
    DATE_ONLY_PATTERN,
    resolveScope,
    scopeWhere,
    translateMembershipError,
    userHasMembershipUsePermission
} from '../membership-utils'
import { MembershipScope, ResolveScopeInput } from '../membership.types'

@Injectable()
export class MembershipPolicyService {
    constructor(
        @InjectRepository(MembershipPlan)
        private readonly planRepository: Repository<MembershipPlan>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @Optional()
        @InjectRepository(UserOrganization)
        private readonly userOrganizationRepository?: Repository<UserOrganization>,
        @Optional()
        @InjectRepository(FeatureOrganization)
        private readonly featureOrganizationRepository?: Repository<FeatureOrganization>,
        @InjectRepository(Organization)
        private readonly organizationRepository?: Repository<Organization>
    ) {}

    async isMembershipPlanEnabled(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        return this.isMembershipPlanEnabledForScope(resolveScope(input), manager)
    }

    async isMembershipAccessEnabled(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        const scope = resolveScope(input)
        if (scope.organizationId && (await this.isMembershipPlanEnabledForScope(scope, manager))) {
            return true
        }
        return this.isMembershipPlanEnabledForScope({ tenantId: scope.tenantId, organizationId: null }, manager)
    }

    /** Includes catalog-derived plans because they also configure effective organization access. */
    async hasActiveMembershipPlan(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        const scope = resolveScope(input)
        const repository = manager?.getRepository(MembershipPlan) ?? this.planRepository
        if (!repository?.count) {
            return false
        }
        return (
            (await repository.count({
                where: {
                    ...scopeWhere(scope.tenantId, scope.organizationId),
                    status: MembershipPlanStatusEnum.Active
                }
            })) > 0
        )
    }

    async isMembershipEligibleUser(tenantId: string, userId: string) {
        return !!(await this.userRepository.findOne({
            select: ['id'],
            where: {
                id: userId,
                tenantId,
                type: UserType.USER
            }
        }))
    }

    async assertMembershipEligibleUser(tenantId: string, userId: string) {
        if (await this.isMembershipEligibleUser(tenantId, userId)) {
            return
        }

        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.MembershipTechnicalUserNotAllowed',
                'Technical users cannot have membership plans.'
            )
        )
    }

    async isActiveOrganizationMember(tenantId: string, organizationId: string, userId: string): Promise<boolean> {
        const membership = await this.userOrganizationRepository?.findOne({
            select: ['id'],
            where: {
                tenantId,
                organizationId,
                userId,
                isActive: true
            }
        })
        return !!membership
    }

    async hasMembershipUsePermission(tenantId: string, userId: string) {
        const user = await this.userRepository.findOne({
            where: { tenantId, id: userId },
            relations: ['role', 'role.rolePermissions']
        })
        return userHasMembershipUsePermission(user)
    }

    async hasMembershipEditPermission(tenantId: string, userId: string) {
        const user = await this.userRepository.findOne({
            where: { tenantId, id: userId },
            relations: ['role', 'role.rolePermissions']
        })
        return (
            user?.type === UserType.USER &&
            !!user.role?.rolePermissions?.some(
                (permission) => permission.enabled && permission.permission === AIPermissionsEnum.MEMBERSHIP_EDIT
            )
        )
    }

    async findMembershipUsePermissionUserIds(tenantId: string, userIds: string[]): Promise<string[]> {
        if (!userIds.length) {
            return []
        }

        const users = await this.userRepository.find({
            where: {
                tenantId,
                id: In(userIds),
                type: UserType.USER
            },
            relations: ['role', 'role.rolePermissions']
        })
        return users.filter((user) => userHasMembershipUsePermission(user)).map((user) => user.id)
    }

    async assertActiveOrganizationMember(
        tenantId: string,
        organizationId: string,
        userId: string,
        manager?: EntityManager
    ) {
        const repository = manager?.getRepository(UserOrganization) ?? this.userOrganizationRepository
        const membership = await repository?.findOne({
            select: ['id'],
            where: {
                tenantId,
                organizationId,
                userId,
                isActive: true
            }
        })
        if (membership) {
            return
        }

        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.MembershipOrganizationMemberRequired',
                'The user is not an active member of the current organization.'
            )
        )
    }

    async isMembershipPlanEnabledForScope(scope: MembershipScope, manager?: EntityManager): Promise<boolean> {
        const organizationToggle = scope.organizationId
            ? await this.findMembershipPlanFeatureToggle(scope, scope.organizationId, manager)
            : null
        if (organizationToggle) {
            return organizationToggle.isEnabled === true
        }

        const tenantToggle = await this.findMembershipPlanFeatureToggle(scope, null, manager)
        return tenantToggle?.isEnabled === true
    }

    async findMembershipPlanFeatureToggle(
        scope: MembershipScope,
        organizationId: string | null,
        manager?: EntityManager
    ): Promise<FeatureOrganization | null> {
        const managerRepository = manager?.getRepository(FeatureOrganization)
        const repository = managerRepository?.createQueryBuilder
            ? managerRepository
            : this.featureOrganizationRepository
        if (!repository?.createQueryBuilder) {
            return null
        }

        const qb = repository
            .createQueryBuilder('featureOrganization')
            .leftJoinAndSelect('featureOrganization.feature', 'feature')
            .where('featureOrganization.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere('feature.code = :code', { code: AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN })

        applyScopeFilter(qb, 'featureOrganization.organizationId', organizationId)

        const toggles = await qb.getMany()
        return toggles.find((toggle) => !!toggle.feature?.parentId) ?? toggles[0] ?? null
    }

    async assertMembershipPlanFeatureEnabled(scope: MembershipScope, manager?: EntityManager) {
        if (await this.isMembershipPlanEnabledForScope(scope, manager)) {
            return
        }

        throw new ForbiddenException(
            translateMembershipError(
                'server-ai:Error.MembershipPlanFeatureDisabled',
                'Membership plan feature is disabled.'
            )
        )
    }

    async normalizeAdminExpiringBefore(value: string, tenantId: string) {
        return DATE_ONLY_PATTERN.test(value)
            ? endOfDayInTimeZone(value, await this.resolveTenantTimeZone(tenantId))
            : new Date(value)
    }

    async resolveTenantTimeZone(tenantId: string) {
        const organization = await this.organizationRepository?.findOne({
            where: { tenantId, isDefault: true },
            select: { id: true, timeZone: true }
        })
        return organization?.timeZone || 'UTC'
    }
}
