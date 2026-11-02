import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AIPermissionsEnum,
    IModelAccessCatalog,
    IModelAccessCatalogItem,
    IModelAccessResolution,
    IUser,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { ExceedingLimitException } from '../../core/errors'
import { MembershipModelAccess, MembershipService } from '../../membership/membership.service'
import { resolveCatalogBillingPayer } from '../policy/model-access-payer'
import { ModelAccessRequest } from '../model-access-request.entity'
import {
    CatalogModelAccessBatchInput,
    CatalogModelLabel,
    MembershipFeatureState,
    ModelAccessResolutionContext,
    ModelTarget,
    ModelTargetAccessMode,
    ResolveModelInput
} from '../model-access.types'
import { UserModelGrant } from '../user-model-grant.entity'

import { ModelAccessLifecycleService } from '../lifecycle/model-access-lifecycle.service'
import { ModelAccessPolicyService } from '../policy/model-access-policy.service'
import { ModelAccessRecordsService } from '../requests/model-access-records.service'
import { ModelAccessTargetsService } from './model-access-targets.service'
import {
    canManageTargetScope,
    modelKey,
    requireTenant,
    requireUser,
    sameModelTarget,
    translate,
    userHasPermission
} from '../model-access.utils'
import { resolveTargetAccessMode } from './model-target.utils'

@Injectable()
export class ModelAccessCatalogService {
    constructor(
        private readonly membershipService: MembershipService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly policy: ModelAccessPolicyService,
        private readonly lifecycle: ModelAccessLifecycleService,
        private readonly targets: ModelAccessTargetsService,
        private readonly records: ModelAccessRecordsService
    ) {}

    async getCatalog(): Promise<IModelAccessCatalog> {
        const tenantId = requireTenant()
        const userId = requireUser()
        const organizationId = RequestContext.getOrganizationId()
        const user = await this.policy.requireNormalUser(tenantId, userId, false)
        await this.lifecycle.processDueGrants({ tenantId, userId })

        const [
            visibleTargets,
            requests,
            initialGrants,
            membershipAccess,
            tenantFeatureEnabled,
            organizationFeatureEnabled,
            tenantMembershipEnabled,
            organizationMembershipEnabled,
            organizationPlanConfigured,
            organizationModelsConfigured
        ] = await Promise.all([
            this.targets.loadVisibleCatalogTargets(organizationId),
            this.records.findUserRequestsForCurrentContext(tenantId, userId, organizationId),
            this.records.findUserGrantsForCurrentContext(tenantId, userId, organizationId),
            this.membershipService.findModelAccess({ tenantId, organizationId, userId }),
            this.policy.isModelAccessFeatureEnabled({
                tenantId,
                organizationId: null
            }),
            organizationId
                ? this.policy.isModelAccessFeatureEnabled({ tenantId, organizationId })
                : Promise.resolve(false),
            this.membershipService.isMembershipPlanEnabled({ tenantId, organizationId: null }),
            organizationId
                ? this.membershipService.isMembershipPlanEnabled({ tenantId, organizationId })
                : Promise.resolve(false),
            organizationId
                ? this.membershipService.hasActiveMembershipPlan({ tenantId, organizationId })
                : Promise.resolve(false),
            organizationId
                ? this.targets.hasConfiguredOrganizationModels(tenantId, organizationId)
                : Promise.resolve(false)
        ])
        let grantStateChanged = false
        for (const grant of initialGrants.filter((item) => item.status === UserModelGrantStatusEnum.Active)) {
            if (await this.lifecycle.reconcileGrantAvailability(grant)) {
                grantStateChanged = true
            }
        }
        const grants = grantStateChanged
            ? await this.records.findUserGrantsForCurrentContext(tenantId, userId, organizationId)
            : initialGrants
        const targets = [...visibleTargets]
        for (const grant of grants.filter((item) => item.status === UserModelGrantStatusEnum.Active)) {
            if (targets.some((target) => sameModelTarget(grant, target))) {
                continue
            }
            const target = await this.targets.loadTarget(
                {
                    tenantId: grant.tenantId,
                    copilotId: grant.copilotId,
                    copilotModelId: grant.copilotModelId,
                    modelType: grant.modelType
                },
                grant.organizationId ?? null
            )
            if (target) {
                targets.push(target)
            }
        }
        const pendingRequests = requests.filter((item) => item.status === ModelAccessRequestStatusEnum.Requested)
        for (const request of pendingRequests) {
            await this.lifecycle.reconcilePendingRequest(request)
        }
        const effectiveRequests = pendingRequests.length
            ? await this.records.findUserRequestsForCurrentContext(tenantId, userId, organizationId)
            : requests

        const items = await Promise.all(
            targets.map((target) =>
                this.toCatalogItem(target, user, effectiveRequests, grants, membershipAccess, {
                    tenantFeatureEnabled,
                    organizationFeatureEnabled,
                    tenantMembershipEnabled,
                    organizationMembershipEnabled,
                    organizationPlanConfigured,
                    organizationModelsConfigured,
                    runtimeOrganizationId: organizationId
                })
            )
        )

        const canRequest = items.some((item) => item.requestable)
        return {
            items,
            canRequest,
            requestBlockedReason: canRequest
                ? null
                : user.type === UserType.COMMUNICATION
                  ? ModelAccessUnavailableReasonEnum.TechnicalUser
                  : items.some((item) => canManageTargetScope(item))
                    ? 'manager'
                    : null,
            tenantFeatureEnabled,
            organizationFeatureEnabled
        }
    }

    async resolveModelAccess(input: ResolveModelInput): Promise<IModelAccessResolution> {
        const billableUserId = await this.membershipService.resolveBillableUserId({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            xpertBillingPayer: resolveCatalogBillingPayer(input)
        })
        const runtimeOrganizationId = input.organizationId ?? null

        await this.lifecycle.processDueGrants({
            tenantId: input.tenantId,
            userId: billableUserId,
            copilotId: input.copilotId,
            copilotModelId: input.copilotModelId,
            modelType: input.modelType
        })
        const target = await this.targets.loadTarget(input, runtimeOrganizationId)
        const grant = await this.records.findActiveGrantByInput(input, billableUserId)

        return this.resolveModelAccessWithContext(input, target, grant, {
            billableUserId,
            runtimeOrganizationId,
            membershipFeatureState: () =>
                this.policy.resolveMembershipFeatureState(input.tenantId, runtimeOrganizationId),
            canManageProviderModels: () =>
                this.policy.hasUserPermission(input.tenantId, billableUserId, AIPermissionsEnum.COPILOT_EDIT),
            membershipAccess: () =>
                this.membershipService.findModelAccess({
                    tenantId: input.tenantId,
                    organizationId: runtimeOrganizationId,
                    userId: billableUserId
                }),
            technicalUser: () => this.policy.isTechnicalUser(input.tenantId, billableUserId),
            modelAccessFeatureEnabled: (organizationId) =>
                this.policy.isModelAccessFeatureEnabled({ tenantId: input.tenantId, organizationId }),
            quotaReason: (access) => this.policy.resolveQuotaReason(access)
        })
    }

    async canUseCatalogModels(input: CatalogModelAccessBatchInput): Promise<boolean[]> {
        if (!input.models.length) {
            return []
        }
        const billableUserId = await this.membershipService.resolveBillableUserId({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            xpertBillingPayer: resolveCatalogBillingPayer(input)
        })
        const runtimeOrganizationId = input.organizationId ?? null
        const modelTypes = new Set(input.models.map((model) => model.modelType))
        await this.lifecycle.processDueGrants({
            tenantId: input.tenantId,
            userId: billableUserId,
            ...(modelTypes.size === 1 ? { modelType: input.models[0].modelType } : {})
        })

        const resolveInputs: ResolveModelInput[] = input.models.map((model) => ({
            tenantId: input.tenantId,
            organizationId: runtimeOrganizationId,
            userId: input.userId,
            xpertId: input.xpertId,
            ...model
        }))
        const [targets, grants] = await Promise.all([
            this.targets.loadTargets(resolveInputs, runtimeOrganizationId),
            this.records.findUserGrantsForCurrentContext(input.tenantId, billableUserId, runtimeOrganizationId)
        ])
        const activeGrants = grants.filter((grant) => grant.status === UserModelGrantStatusEnum.Active)

        let membershipFeatureStatePromise: Promise<MembershipFeatureState> | null = null
        let membershipAccessPromise: Promise<MembershipModelAccess | null> | null = null
        let quotaReasonPromise: Promise<ModelAccessUnavailableReasonEnum | null> | null = null
        let userStatePromise: Promise<{ canManageProviderModels: boolean; technicalUser: boolean }> | null = null
        const featureEnabledByScope = new Map<string | null, Promise<boolean>>()
        const userState = () =>
            (userStatePromise ??= this.userRepository
                .findOne({
                    where: { tenantId: input.tenantId, id: billableUserId },
                    relations: ['role', 'role.rolePermissions']
                })
                .then((user) => ({
                    canManageProviderModels: !!user && userHasPermission(user, AIPermissionsEnum.COPILOT_EDIT) === true,
                    technicalUser: user?.type === UserType.COMMUNICATION
                })))
        const context: ModelAccessResolutionContext = {
            billableUserId,
            runtimeOrganizationId,
            membershipFeatureState: () =>
                (membershipFeatureStatePromise ??= this.policy.resolveMembershipFeatureState(
                    input.tenantId,
                    runtimeOrganizationId
                )),
            canManageProviderModels: async () => (await userState()).canManageProviderModels,
            membershipAccess: () =>
                (membershipAccessPromise ??= this.membershipService.findModelAccess({
                    tenantId: input.tenantId,
                    organizationId: runtimeOrganizationId,
                    userId: billableUserId
                })),
            technicalUser: async () => (await userState()).technicalUser,
            modelAccessFeatureEnabled: (organizationId) => {
                let enabled = featureEnabledByScope.get(organizationId)
                if (!enabled) {
                    enabled = this.policy.isModelAccessFeatureEnabled({ tenantId: input.tenantId, organizationId })
                    featureEnabledByScope.set(organizationId, enabled)
                }
                return enabled
            },
            quotaReason: (access) => (quotaReasonPromise ??= this.policy.resolveQuotaReason(access))
        }

        const availability: boolean[] = []
        for (let index = 0; index < resolveInputs.length; index++) {
            const resolveInput = resolveInputs[index]
            const target = targets[index]
            const grant = activeGrants.find(
                (item) =>
                    item.copilotId === resolveInput.copilotId &&
                    item.copilotModelId === resolveInput.copilotModelId &&
                    item.modelType === resolveInput.modelType
            )
            const resolution = await this.resolveModelAccessWithContext(resolveInput, target, grant, context)
            availability.push(resolution.allowed)
        }
        return availability
    }

    async getCatalogModelLabels(input: CatalogModelAccessBatchInput): Promise<Array<CatalogModelLabel | null>> {
        if (!input.models.length) {
            return []
        }
        const runtimeOrganizationId = input.organizationId ?? null
        const targets = await this.targets.loadTargets(
            input.models.map((model) => ({
                tenantId: input.tenantId,
                organizationId: runtimeOrganizationId,
                userId: input.userId,
                xpertId: input.xpertId,
                ...model
            })),
            runtimeOrganizationId
        )
        return targets.map((target) =>
            target
                ? {
                      capabilities: target.capabilities,
                      providerLabel: target.providerLabel,
                      provider: target.provider,
                      providerIconSmall: target.providerIconSmall,
                      providerBackground: target.providerBackground,
                      modelLabel: target.modelLabel
                  }
                : null
        )
    }

    private async resolveModelAccessWithContext(
        input: ResolveModelInput,
        target: ModelTarget | null,
        grant: UserModelGrant | null | undefined,
        context: ModelAccessResolutionContext
    ): Promise<IModelAccessResolution> {
        const fallbackScope = ModelAccessOwnershipScopeEnum.Tenant
        if (!target) {
            if (grant) {
                await this.lifecycle.revokeGrantForDeletedModel(grant)
            }
            return {
                allowed: false,
                channel: ModelAccessChannelEnum.Xpert,
                billableUserId: context.billableUserId,
                copilotId: input.copilotId,
                copilotModelId: input.copilotModelId,
                modelType: input.modelType,
                accessSource: grant ? ModelAccessSourceEnum.Grant : null,
                grantId: grant?.id,
                multiplier: 1,
                scope: grant?.ownershipScope ?? fallbackScope,
                organizationId: grant?.organizationId ?? null,
                unavailableReason: ModelAccessUnavailableReasonEnum.ModelDeleted
            }
        }

        const membershipFeatureState = await context.membershipFeatureState()
        const canManageProviderModels =
            target.usesOrganizationCredentials &&
            membershipFeatureState.organizationEnabled &&
            membershipFeatureState.organizationPlanConfigured
                ? await context.canManageProviderModels()
                : false
        const accessMode = resolveTargetAccessMode(
            target,
            context.runtimeOrganizationId,
            membershipFeatureState,
            canManageProviderModels
        )
        if (accessMode === ModelTargetAccessMode.Direct) {
            return {
                allowed: target.enabled,
                channel: ModelAccessChannelEnum.Xpert,
                billableUserId: context.billableUserId,
                copilotId: target.copilotId,
                copilotModelId: target.copilotModelId,
                provider: target.provider,
                modelType: target.modelType,
                model: target.model,
                accessSource: ModelAccessSourceEnum.Direct,
                multiplier: 1,
                scope: target.ownershipScope,
                organizationId: target.organizationId,
                unavailableReason: target.enabled ? null : ModelAccessUnavailableReasonEnum.ModelDisabled
            }
        }
        if (accessMode === ModelTargetAccessMode.Blocked) {
            if (grant) {
                await this.lifecycle.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.FeatureDisabled)
            }
            return {
                allowed: false,
                channel: ModelAccessChannelEnum.Xpert,
                billableUserId: context.billableUserId,
                copilotId: target.copilotId,
                copilotModelId: target.copilotModelId,
                provider: target.provider,
                modelType: target.modelType,
                model: target.model,
                accessSource: grant ? ModelAccessSourceEnum.Grant : null,
                grantId: grant?.id,
                multiplier: 1,
                scope: target.ownershipScope,
                organizationId: target.organizationId,
                unavailableReason: ModelAccessUnavailableReasonEnum.FeatureDisabled
            }
        }

        const membershipAccess = await context.membershipAccess()
        if (this.policy.isPlanIncluded(target, membershipAccess)) {
            const unavailableReason = target.enabled
                ? await context.quotaReason(membershipAccess)
                : ModelAccessUnavailableReasonEnum.ModelDisabled
            return {
                allowed: target.enabled,
                channel: ModelAccessChannelEnum.Xpert,
                billableUserId: context.billableUserId,
                copilotId: target.copilotId,
                copilotModelId: target.copilotModelId,
                provider: target.provider,
                modelType: target.modelType,
                model: target.model,
                accessSource: ModelAccessSourceEnum.Plan,
                planId: membershipAccess?.membership.planId,
                multiplier: this.membershipService.resolveModelMultiplierForPlan(
                    membershipAccess.membership.plan,
                    target.provider,
                    target.model
                ),
                scope: target.ownershipScope,
                organizationId: target.organizationId,
                unavailableReason
            }
        }

        if (!grant) {
            return {
                allowed: false,
                channel: ModelAccessChannelEnum.Xpert,
                billableUserId: context.billableUserId,
                copilotId: target.copilotId,
                copilotModelId: target.copilotModelId,
                provider: target.provider,
                modelType: target.modelType,
                model: target.model,
                accessSource: null,
                multiplier: 1,
                scope: target.ownershipScope,
                organizationId: target.organizationId,
                unavailableReason: membershipAccess ? null : ModelAccessUnavailableReasonEnum.MembershipRequired
            }
        }

        if (await context.technicalUser()) {
            await this.lifecycle.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.TechnicalUser)
            return {
                allowed: false,
                channel: ModelAccessChannelEnum.Xpert,
                billableUserId: context.billableUserId,
                copilotId: target.copilotId,
                copilotModelId: target.copilotModelId,
                provider: target.provider,
                modelType: target.modelType,
                model: target.model,
                accessSource: ModelAccessSourceEnum.Grant,
                grantId: grant.id,
                planId: membershipAccess?.membership.planId,
                multiplier: 1,
                scope: target.ownershipScope,
                organizationId: target.organizationId,
                unavailableReason: ModelAccessUnavailableReasonEnum.TechnicalUser
            }
        }

        const featureEnabled = await context.modelAccessFeatureEnabled(target.organizationId)
        const unavailableReason = !featureEnabled
            ? ModelAccessUnavailableReasonEnum.FeatureDisabled
            : !target.enabled
              ? ModelAccessUnavailableReasonEnum.ModelDisabled
              : await context.quotaReason(membershipAccess)
        await this.lifecycle.recordGrantAvailability(grant, unavailableReason)
        return {
            allowed:
                unavailableReason === null ||
                unavailableReason === ModelAccessUnavailableReasonEnum.QuotaExhausted ||
                unavailableReason === ModelAccessUnavailableReasonEnum.MembershipRequired,
            channel: ModelAccessChannelEnum.Xpert,
            billableUserId: context.billableUserId,
            copilotId: target.copilotId,
            copilotModelId: target.copilotModelId,
            provider: target.provider,
            modelType: target.modelType,
            model: target.model,
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: grant.id,
            planId: membershipAccess?.membership.planId,
            multiplier: 1,
            scope: target.ownershipScope,
            organizationId: target.organizationId,
            unavailableReason
        }
    }

    async assertCanUseModel(input: ResolveModelInput): Promise<IModelAccessResolution> {
        const resolution = await this.resolveModelAccess(input)
        if (!resolution.allowed) {
            throw new ExceedingLimitException(
                translate(
                    'server-ai:Error.CopilotModelUnavailableForMembershipPlan',
                    'Copilot model is not available for the current account.'
                )
            )
        }
        await this.membershipService.assertCanUse(
            {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                copilotOrganizationId: resolution.organizationId,
                copilotId: resolution.copilotId,
                userId: resolution.billableUserId,
                provider: resolution.provider ?? undefined,
                model: resolution.model ?? undefined
            },
            resolution
        )
        return resolution
    }

    async canUseCatalogModel(input: ResolveModelInput): Promise<boolean> {
        const resolution = await this.resolveModelAccess(input)
        return resolution.allowed
    }

    private async toCatalogItem(
        target: ModelTarget,
        user: IUser,
        requests: ModelAccessRequest[],
        grants: UserModelGrant[],
        membershipAccess: MembershipModelAccess | null,
        features: {
            tenantFeatureEnabled: boolean
            organizationFeatureEnabled: boolean
            tenantMembershipEnabled: boolean
            organizationMembershipEnabled: boolean
            organizationPlanConfigured: boolean
            organizationModelsConfigured: boolean
            runtimeOrganizationId: string | null
        }
    ): Promise<IModelAccessCatalogItem> {
        const accessMode = resolveTargetAccessMode(
            target,
            features.runtimeOrganizationId,
            {
                tenantEnabled: features.tenantMembershipEnabled,
                organizationEnabled: features.organizationMembershipEnabled,
                organizationPlanConfigured: features.organizationPlanConfigured,
                organizationModelsConfigured: features.organizationModelsConfigured
            },
            userHasPermission(user, AIPermissionsEnum.COPILOT_EDIT) === true
        )
        const planIncluded =
            accessMode === ModelTargetAccessMode.Membership && this.policy.isPlanIncluded(target, membershipAccess)
        const grant =
            grants.find((item) => sameModelTarget(item, target) && item.status === UserModelGrantStatusEnum.Active) ??
            null
        const effectiveGrant = user.type === UserType.COMMUNICATION ? null : grant
        const pendingRequest =
            requests.find(
                (item) => sameModelTarget(item, target) && item.status === ModelAccessRequestStatusEnum.Requested
            ) ?? null
        const featureEnabled =
            target.ownershipScope === ModelAccessOwnershipScopeEnum.Tenant
                ? features.tenantFeatureEnabled
                : features.organizationFeatureEnabled
        const manager = canManageTargetScope(target)
        const quotaReason =
            accessMode === ModelTargetAccessMode.Membership
                ? await this.policy.resolveQuotaReason(membershipAccess)
                : null
        const grantUnavailableReason = effectiveGrant
            ? accessMode === ModelTargetAccessMode.Blocked || !featureEnabled
                ? ModelAccessUnavailableReasonEnum.FeatureDisabled
                : !target.enabled
                  ? ModelAccessUnavailableReasonEnum.ModelDisabled
                  : quotaReason
            : null
        if (grant && !effectiveGrant) {
            await this.lifecycle.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.TechnicalUser)
        } else if (effectiveGrant) {
            await this.lifecycle.recordGrantAvailability(effectiveGrant, grantUnavailableReason)
        }
        return {
            key: modelKey(target),
            channel: ModelAccessChannelEnum.Xpert,
            copilotId: target.copilotId,
            copilotModelId: target.copilotModelId,
            copilotName: target.copilotName,
            provider: target.provider,
            providerLabel: target.providerLabel,
            modelType: target.modelType,
            model: target.model,
            modelLabel: target.modelLabel,
            ownershipScope: target.ownershipScope,
            organizationId: target.organizationId,
            accessSource:
                accessMode === ModelTargetAccessMode.Direct
                    ? ModelAccessSourceEnum.Direct
                    : planIncluded
                      ? ModelAccessSourceEnum.Plan
                      : effectiveGrant
                        ? ModelAccessSourceEnum.Grant
                        : null,
            grantId: effectiveGrant?.id,
            planIncluded,
            allowed:
                accessMode === ModelTargetAccessMode.Direct
                    ? target.enabled
                    : accessMode === ModelTargetAccessMode.Membership &&
                      ((planIncluded && target.enabled) ||
                          (!!effectiveGrant &&
                              (grantUnavailableReason === null ||
                                  grantUnavailableReason === ModelAccessUnavailableReasonEnum.QuotaExhausted ||
                                  grantUnavailableReason === ModelAccessUnavailableReasonEnum.MembershipRequired))),
            requestable:
                accessMode === ModelTargetAccessMode.Membership &&
                user.type !== UserType.COMMUNICATION &&
                target.listedForRequest === true &&
                target.enabled &&
                featureEnabled &&
                !manager &&
                !planIncluded &&
                !effectiveGrant &&
                !pendingRequest,
            unavailableReason:
                accessMode === ModelTargetAccessMode.Direct
                    ? target.enabled
                        ? null
                        : ModelAccessUnavailableReasonEnum.ModelDisabled
                    : accessMode === ModelTargetAccessMode.Blocked
                      ? ModelAccessUnavailableReasonEnum.FeatureDisabled
                      : planIncluded && !target.enabled
                        ? ModelAccessUnavailableReasonEnum.ModelDisabled
                        : planIncluded
                          ? quotaReason
                          : grantUnavailableReason,
            pendingRequest,
            grant: effectiveGrant
        }
    }
}
