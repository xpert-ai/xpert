import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AIPermissionsEnum,
    AiFeatureEnum,
    IUser,
    ModelAccessChannelEnum,
    ModelAccessUnavailableReasonEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FeatureOrganization, Organization, User } from '@xpert-ai/server-core'
import { EntityManager, Repository } from 'typeorm'
import { MembershipModelAccess, MembershipService } from '../../membership/membership.service'
import { endOfDayInTimeZone } from '../../shared/utils'
import { MembershipFeatureState, ModelTarget } from '../model-access.types'

import { ModelAccessTargetsService } from '../catalog/model-access-targets.service'
import {
    applyScopeFilter,
    currentScope,
    modelAccessEndOfDay,
    requireTenant,
    translate,
    userHasPermission
} from '../model-access.utils'
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

@Injectable()
export class ModelAccessPolicyService {
    constructor(
        private readonly membershipService: MembershipService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(FeatureOrganization)
        private readonly featureOrganizationRepository: Repository<FeatureOrganization>,
        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>,
        private readonly targets: ModelAccessTargetsService
    ) {}

    isPlanIncluded(target: ModelTarget, access: MembershipModelAccess | null) {
        if (!access) {
            return false
        }
        const scopeMatches =
            access.organizationId === target.organizationId ||
            (target.organizationId === null && !!access.organizationId && !!access.membership.plan.catalogSourcePlanId)
        return (
            scopeMatches &&
            this.membershipService.isModelAllowed(
                access.membership.plan,
                target.provider,
                target.model,
                target.copilotId
            )
        )
    }

    async resolveMembershipFeatureState(
        tenantId: string,
        runtimeOrganizationId: string | null
    ): Promise<MembershipFeatureState> {
        const [tenantEnabled, organizationEnabled, organizationPlanConfigured, organizationModelsConfigured] =
            await Promise.all([
                this.membershipService.isMembershipPlanEnabled({ tenantId, organizationId: null }),
                runtimeOrganizationId
                    ? this.membershipService.isMembershipPlanEnabled({
                          tenantId,
                          organizationId: runtimeOrganizationId
                      })
                    : Promise.resolve(false),
                runtimeOrganizationId
                    ? this.membershipService.hasActiveMembershipPlan({
                          tenantId,
                          organizationId: runtimeOrganizationId
                      })
                    : Promise.resolve(false),
                runtimeOrganizationId
                    ? this.targets.hasConfiguredOrganizationModels(tenantId, runtimeOrganizationId)
                    : Promise.resolve(false)
            ])
        return {
            tenantEnabled,
            organizationEnabled,
            organizationPlanConfigured,
            organizationModelsConfigured
        }
    }

    async resolveQuotaReason(access: MembershipModelAccess | null) {
        if (!access) {
            return ModelAccessUnavailableReasonEnum.MembershipRequired
        }
        return (await this.membershipService.hasConsumableBalance(access))
            ? null
            : ModelAccessUnavailableReasonEnum.QuotaExhausted
    }

    async isModelGatewayFeatureEnabled(
        scope: string | { tenantId: string; organizationId: string | null },
        manager?: EntityManager
    ) {
        const targetScope = typeof scope === 'string' ? { tenantId: scope, organizationId: null } : scope
        if (!(await this.membershipService.isMembershipPlanEnabled(targetScope, manager))) {
            return false
        }
        return this.isFeatureEnabledForScope(AiFeatureEnum.FEATURE_MODEL_GATEWAY, targetScope, manager)
    }

    async assertModelGatewayFeatureEnabled(
        scope: string | { tenantId: string; organizationId: string | null },
        manager?: EntityManager
    ) {
        if (await this.isModelGatewayFeatureEnabled(scope, manager)) {
            return
        }
        throw new ForbiddenException(
            translate('server-ai:Error.ModelGatewayFeatureDisabled', 'External model API access is disabled.')
        )
    }

    async assertAdminChannelFeatureEnabled(channel?: ModelAccessChannelEnum, manager?: EntityManager) {
        if (channel === ModelAccessChannelEnum.ExternalApi) {
            return this.assertModelGatewayFeatureEnabled(currentScope(), manager)
        }
        if (channel === ModelAccessChannelEnum.Xpert) {
            return this.assertCurrentAdminFeatureEnabled(manager)
        }
        const scope = currentScope()
        if (
            (await this.isModelAccessFeatureEnabled(scope, manager)) ||
            (await this.isModelGatewayFeatureEnabled(scope, manager))
        ) {
            return
        }
        throw new ForbiddenException(
            translate('server-ai:Error.ModelAccessFeatureDisabled', 'Personal model access is disabled.')
        )
    }

    async assertExternalGatewayEligibility(
        scope: { tenantId: string; organizationId: string | null },
        user: IUser,
        manager?: EntityManager
    ) {
        await this.assertModelGatewayFeatureEnabled(scope, manager)
        if (user.type === UserType.COMMUNICATION || !userHasPermission(user, AIPermissionsEnum.MODEL_GATEWAY_USE)) {
            throw new ForbiddenException(
                translate(
                    'server-ai:Error.ModelGatewayPermissionRequired',
                    'Your role is not allowed to use the external model API.'
                )
            )
        }
    }

    async hasUserPermission(tenantId: string, userId: string, permission: AIPermissionsEnum) {
        const user = await this.userRepository.findOne({
            where: { tenantId, id: userId },
            relations: ['role', 'role.rolePermissions']
        })
        return !!user && userHasPermission(user, permission) === true
    }

    async isModelAccessFeatureEnabled(
        scope: { tenantId: string; organizationId: string | null },
        manager?: EntityManager
    ) {
        if (!(await this.membershipService.isMembershipPlanEnabled(scope, manager))) {
            return false
        }
        return this.isFeatureEnabledForScope(AiFeatureEnum.FEATURE_MODEL_ACCESS_REQUEST, scope, manager)
    }

    private async isFeatureEnabledForScope(
        code: AiFeatureEnum,
        scope: { tenantId: string; organizationId: string | null },
        manager?: EntityManager
    ) {
        const organizationToggle = scope.organizationId
            ? await this.findFeatureToggle(code, scope.tenantId, scope.organizationId, manager)
            : null
        if (organizationToggle) {
            return organizationToggle.isEnabled === true
        }

        const tenantToggle = await this.findFeatureToggle(code, scope.tenantId, null, manager)
        return tenantToggle?.isEnabled === true
    }

    private async findFeatureToggle(
        code: AiFeatureEnum,
        tenantId: string,
        organizationId: string | null,
        manager?: EntityManager
    ) {
        const repository = manager?.getRepository(FeatureOrganization) ?? this.featureOrganizationRepository
        const qb = repository
            .createQueryBuilder('featureOrganization')
            .leftJoinAndSelect('featureOrganization.feature', 'feature')
            .where('featureOrganization.tenantId = :tenantId', { tenantId })
            .andWhere('feature.code = :code', { code })
        applyScopeFilter(qb, 'featureOrganization.organizationId', organizationId)
        return qb.getOne()
    }

    async assertRequestFeatureEnabled(target: ModelTarget, manager?: EntityManager) {
        if (
            await this.isModelAccessFeatureEnabled(
                { tenantId: target.tenantId, organizationId: target.organizationId },
                manager
            )
        ) {
            return
        }
        throw new ForbiddenException(
            translate('server-ai:Error.ModelAccessFeatureDisabled', 'Personal model access is disabled.')
        )
    }

    async assertCurrentAdminFeatureEnabled(manager?: EntityManager) {
        const scope = currentScope()
        if (await this.isModelAccessFeatureEnabled(scope, manager)) {
            return
        }
        throw new ForbiddenException(
            translate('server-ai:Error.ModelAccessFeatureDisabled', 'Personal model access is disabled.')
        )
    }

    async isTechnicalUser(tenantId: string, userId: string, manager?: EntityManager) {
        const repository = manager?.getRepository(User) ?? this.userRepository
        const user = await repository.findOne({
            where: { tenantId, id: userId },
            select: { id: true, type: true }
        })
        return user?.type === UserType.COMMUNICATION
    }

    async requireNormalUser(tenantId: string, userId: string, throwForTechnical = true) {
        const user =
            RequestContext.currentUser()?.id === userId
                ? RequestContext.currentUser()
                : await this.userRepository.findOne({
                      where: { tenantId, id: userId },
                      relations: ['role', 'role.rolePermissions']
                  })
        if (!user) {
            throw new NotFoundException(translate('server-ai:Error.ModelAccessUserNotFound', 'User not found.'))
        }
        if (user.type === UserType.COMMUNICATION && throwForTechnical) {
            throw new ForbiddenException(
                translate(
                    'server-ai:Error.ModelAccessTechnicalUserForbidden',
                    'Technical users cannot request or receive personal model access.'
                )
            )
        }
        return user
    }

    async normalizeValidUntil(value: string | null | undefined, manager?: EntityManager) {
        if (!value) {
            return null
        }
        const dateOnly = DATE_ONLY_PATTERN.test(value)
        const validUntil = dateOnly
            ? modelAccessEndOfDay(value, await this.resolveTenantTimeZone(requireTenant(), manager))
            : new Date(value)
        if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
            throw new BadRequestException(
                translate('server-ai:Error.ModelAccessInvalidExpiration', 'The grant expiration must be in the future.')
            )
        }
        return validUntil
    }

    async normalizeAdminExpiresBefore(value: string, tenantId: string) {
        return DATE_ONLY_PATTERN.test(value)
            ? endOfDayInTimeZone(value, await this.resolveTenantTimeZone(tenantId))
            : new Date(value)
    }

    private async resolveTenantTimeZone(tenantId: string, manager?: EntityManager) {
        const repository = manager?.getRepository(Organization) ?? this.organizationRepository
        const organization = await repository.findOne({
            where: { tenantId, isDefault: true },
            select: { id: true, timeZone: true }
        })
        return organization?.timeZone || 'UTC'
    }
}
