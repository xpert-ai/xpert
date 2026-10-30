import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    AIPermissionsEnum,
    AiModelTypeEnum,
    IModelAccessRequest,
    IModelAccessResolution,
    IModelGatewayCatalog,
    IModelGatewayCatalogItem,
    IUserModelGrant,
    ModelAccessChannelEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    TModelGatewayExternalRequestCreateInput,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, Repository } from 'typeorm'
import { MembershipService } from '../membership/membership.service'
import { ModelGatewayPublication } from '../model-gateway/model-gateway-publication.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { snapshotModelTarget } from './model-access.utils'

import { ModelAccessLifecycleService } from './model-access-lifecycle.service'
import { ModelAccessPolicyService } from './model-access-policy.service'
import { ModelAccessRecordsService } from './model-access-records.service'
import { ModelAccessRequestsService } from './model-access-requests.service'
import { ModelAccessTargetsService } from './model-access-targets.service'
import {
    canManageTargetScope,
    isUniqueViolation,
    requireTenant,
    requireText,
    requireUser,
    sameModelTarget,
    translate,
    userHasPermission,
    userName
} from './model-access.utils'

@Injectable()
export class ModelAccessGatewayService {
    constructor(
        private readonly membershipService: MembershipService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(ModelGatewayPublication)
        private readonly publicationRepository: Repository<ModelGatewayPublication>,
        private readonly policy: ModelAccessPolicyService,
        private readonly lifecycle: ModelAccessLifecycleService,
        private readonly targets: ModelAccessTargetsService,
        private readonly records: ModelAccessRecordsService,
        private readonly requests: ModelAccessRequestsService
    ) {}

    async getExternalCatalog(): Promise<IModelGatewayCatalog> {
        const tenantId = requireTenant()
        const userId = requireUser()
        const organizationId = RequestContext.getOrganizationId()
        const user = await this.policy.requireNormalUser(tenantId, userId, false)
        await this.lifecycle.processDueGrants({ tenantId, userId })
        const [tenantFeatureEnabled, organizationFeatureEnabled, visibleTargets, requests, grants, membershipAccess] =
            await Promise.all([
                this.policy.isModelGatewayFeatureEnabled({ tenantId, organizationId: null }),
                organizationId
                    ? this.policy.isModelGatewayFeatureEnabled({ tenantId, organizationId })
                    : Promise.resolve(false),
                this.targets.loadVisibleCatalogTargets(organizationId),
                this.records.findUserRequestsForCurrentContext(
                    tenantId,
                    userId,
                    organizationId,
                    ModelAccessChannelEnum.ExternalApi
                ),
                this.records.findUserGrantsForCurrentContext(
                    tenantId,
                    userId,
                    organizationId,
                    ModelAccessChannelEnum.ExternalApi
                ),
                this.membershipService.findModelAccess({ tenantId, organizationId, userId })
            ])
        const targets = visibleTargets.filter((target) => target.modelType === AiModelTypeEnum.LLM)
        const publications = await this.targets.ensureAutomaticPublications(targets)
        const userEligible =
            user.type !== UserType.COMMUNICATION && userHasPermission(user, AIPermissionsEnum.MODEL_GATEWAY_USE)
        const currentScopeFeatureEnabled = organizationId ? organizationFeatureEnabled : tenantFeatureEnabled
        const eligible = userEligible && currentScopeFeatureEnabled
        const balanceAvailable = membershipAccess
            ? await this.membershipService.hasConsumableBalance(membershipAccess)
            : false
        const items: IModelGatewayCatalogItem[] = []
        for (const publication of publications) {
            const target = targets.find(
                (item) =>
                    item.copilotId === publication.copilotId &&
                    item.copilotModelId === publication.copilotModelId &&
                    item.modelType === publication.modelType
            )
            const pendingRequest =
                requests.find(
                    (request) =>
                        !!target &&
                        sameModelTarget(request, target) &&
                        request.status === ModelAccessRequestStatusEnum.Requested
                ) ?? null
            const grant =
                grants.find(
                    (item) =>
                        !!target &&
                        sameModelTarget(item, target) &&
                        item.status === UserModelGrantStatusEnum.Active &&
                        (!item.validUntil || new Date(item.validUntil).getTime() > Date.now())
                ) ?? null
            const planIncluded =
                !!target &&
                !!membershipAccess &&
                this.membershipService.isModelAllowed(
                    membershipAccess.membership.plan,
                    target.provider,
                    target.model,
                    target.copilotId
                )
            const multiplier = planIncluded
                ? this.membershipService.resolveModelMultiplierForPlan(
                      membershipAccess.membership.plan,
                      target.provider,
                      target.model
                  )
                : 1
            const featureEnabled =
                currentScopeFeatureEnabled &&
                (target?.ownershipScope === ModelAccessOwnershipScopeEnum.Organization
                    ? organizationFeatureEnabled
                    : tenantFeatureEnabled)
            const unavailableReason = !grant
                ? null
                : !userEligible
                  ? ModelAccessUnavailableReasonEnum.ExternalApiIneligible
                  : !featureEnabled
                    ? ModelAccessUnavailableReasonEnum.FeatureDisabled
                    : !target
                      ? ModelAccessUnavailableReasonEnum.ModelDeleted
                      : !target.enabled
                        ? ModelAccessUnavailableReasonEnum.ModelDisabled
                        : !membershipAccess
                          ? ModelAccessUnavailableReasonEnum.MembershipRequired
                          : !balanceAvailable
                            ? ModelAccessUnavailableReasonEnum.QuotaExhausted
                            : null
            items.push({
                id: publication.id,
                copilotId: publication.copilotId,
                copilotModelId: publication.copilotModelId,
                provider: publication.provider,
                modelType: publication.modelType,
                model: publication.model,
                externalModelId: publication.externalModelId,
                capabilities: publication.capabilities,
                deprecated: target?.deprecated === true,
                allowed: !!grant && unavailableReason === null,
                unavailableReason,
                requestable: userEligible && featureEnabled && !!target?.enabled && !grant && !pendingRequest,
                planIncluded,
                multiplier,
                pendingRequest,
                grant
            })
        }
        items.sort((left, right) => left.externalModelId.localeCompare(right.externalModelId))
        return { items, eligible, tenantFeatureEnabled, organizationFeatureEnabled }
    }

    async createExternalRequest(
        input: TModelGatewayExternalRequestCreateInput
    ): Promise<IModelAccessRequest | IUserModelGrant> {
        const tenantId = requireTenant()
        const requesterId = requireUser()
        const requestedFromOrganizationId = RequestContext.getOrganizationId()
        const requester = await this.policy.requireNormalUser(tenantId, requesterId)
        const target = await this.targets.requireVisibleEnabledTarget({
            tenantId,
            organizationId: requestedFromOrganizationId,
            copilotId: input.copilotId,
            copilotModelId: input.copilotModelId,
            modelType: input.modelType
        })
        await this.policy.assertExternalGatewayEligibility(
            { tenantId, organizationId: requestedFromOrganizationId },
            requester
        )
        if (target.organizationId !== requestedFromOrganizationId) {
            await this.policy.assertModelGatewayFeatureEnabled({ tenantId, organizationId: target.organizationId })
        }
        if (target.modelType !== AiModelTypeEnum.LLM) {
            throw new BadRequestException(
                translate(
                    'server-ai:Error.ModelGatewayChatOnly',
                    'The model gateway only supports chat language models.'
                )
            )
        }
        const reason = requireText(
            input.reason,
            'server-ai:Error.ModelAccessRequestReasonRequired',
            'Request reason is required.'
        )
        const [publication] = await this.targets.ensureAutomaticPublications([target])
        await this.lifecycle.processDueGrants({
            tenantId,
            userId: requesterId,
            copilotId: target.copilotId,
            copilotModelId: target.copilotModelId,
            modelType: target.modelType
        })
        const activeGrant = await this.records.findActiveGrant(
            target,
            requesterId,
            undefined,
            ModelAccessChannelEnum.ExternalApi
        )
        if (activeGrant) {
            return this.records.attachEventsToGrant(activeGrant)
        }
        const existing = await this.records.findPendingRequest(target, requesterId, ModelAccessChannelEnum.ExternalApi)
        if (existing) {
            return this.records.attachEventsToRequest(existing)
        }

        const snapshot = { ...snapshotModelTarget(target), externalModelId: publication.externalModelId }
        let saved: ModelAccessRequest
        try {
            saved = await this.dataSource.transaction(async (manager) => {
                const request = manager.getRepository(ModelAccessRequest).create({
                    tenantId,
                    organizationId: target.organizationId,
                    channel: ModelAccessChannelEnum.ExternalApi,
                    requesterId,
                    requesterName: userName(requester),
                    requestedFromOrganizationId,
                    copilotId: target.copilotId,
                    copilotModelId: target.copilotModelId,
                    provider: target.provider,
                    modelType: target.modelType,
                    model: target.model,
                    ownershipScope: target.ownershipScope,
                    reason,
                    status: ModelAccessRequestStatusEnum.Requested,
                    gatewayPublicationId: publication.id,
                    externalModelId: publication.externalModelId,
                    modelSnapshot: snapshot
                })
                const created = await manager.getRepository(ModelAccessRequest).save(request)
                await this.records.writeEvent(manager, {
                    tenantId,
                    organizationId: target.organizationId,
                    channel: ModelAccessChannelEnum.ExternalApi,
                    requestId: created.id,
                    eventType: ModelAccessEventTypeEnum.Requested,
                    actor: requester,
                    fromStatus: null,
                    toStatus: created.status,
                    reason,
                    idempotencyKey: `request:${created.id}:requested`,
                    modelSnapshot: snapshot
                })
                return created
            })
        } catch (error) {
            if (isUniqueViolation(error)) {
                const duplicate = await this.records.findPendingRequest(
                    target,
                    requesterId,
                    ModelAccessChannelEnum.ExternalApi
                )
                if (duplicate) {
                    return this.records.attachEventsToRequest(duplicate)
                }
            }
            throw error
        }

        if (canManageTargetScope(target)) {
            const grant = await this.requests.approveRequest(saved.id, {
                note: translate(
                    'server-ai:ModelGateway.PrivilegedRequestApproved',
                    'Approved automatically for a model access administrator.'
                )
            })
            return grant ?? this.records.attachEventsToRequest(saved)
        }
        return this.records.attachEventsToRequest(saved)
    }

    async resolveExternalModelAccess(input: {
        tenantId: string
        organizationId: string | null
        userId: string
        publicationId: string
    }): Promise<IModelAccessResolution> {
        const publicationQuery = this.publicationRepository
            .createQueryBuilder('publication')
            .where('publication.tenantId = :tenantId', { tenantId: input.tenantId })
            .andWhere('publication.id = :publicationId', { publicationId: input.publicationId })
        if (input.organizationId) {
            publicationQuery.andWhere(
                '(publication.organizationId IS NULL OR publication.organizationId = :organizationId)',
                { organizationId: input.organizationId }
            )
        } else {
            publicationQuery.andWhere('publication.organizationId IS NULL')
        }
        const publication = await publicationQuery.getOne()
        const publicationOrganizationId = publication?.organizationId ?? null
        const ownershipScope = publicationOrganizationId
            ? ModelAccessOwnershipScopeEnum.Organization
            : ModelAccessOwnershipScopeEnum.Tenant
        const fallback = {
            allowed: false,
            channel: ModelAccessChannelEnum.ExternalApi,
            billableUserId: input.userId,
            copilotId: publication?.copilotId ?? '',
            copilotModelId: publication?.copilotModelId ?? '',
            provider: publication?.provider ?? null,
            modelType: publication?.modelType ?? AiModelTypeEnum.LLM,
            model: publication?.model ?? null,
            accessSource: ModelAccessSourceEnum.Grant,
            multiplier: 1,
            scope: ownershipScope,
            organizationId: publicationOrganizationId,
            gatewayPublicationId: publication?.id ?? input.publicationId,
            externalModelId: publication?.externalModelId ?? null
        } satisfies IModelAccessResolution
        if (!publication) {
            return { ...fallback, unavailableReason: ModelAccessUnavailableReasonEnum.ModelDeleted }
        }
        const user = await this.policy.requireNormalUser(input.tenantId, input.userId, false)
        const [keyScopeFeatureEnabled, publicationScopeFeatureEnabled] = await Promise.all([
            this.policy.isModelGatewayFeatureEnabled({
                tenantId: input.tenantId,
                organizationId: input.organizationId
            }),
            publicationOrganizationId === input.organizationId
                ? Promise.resolve(true)
                : this.policy.isModelGatewayFeatureEnabled({
                      tenantId: input.tenantId,
                      organizationId: publicationOrganizationId
                  })
        ])
        if (
            user.type === UserType.COMMUNICATION ||
            !keyScopeFeatureEnabled ||
            !publicationScopeFeatureEnabled ||
            !userHasPermission(user, AIPermissionsEnum.MODEL_GATEWAY_USE)
        ) {
            return { ...fallback, unavailableReason: ModelAccessUnavailableReasonEnum.ExternalApiIneligible }
        }
        const target = await this.targets.loadTarget(
            {
                tenantId: input.tenantId,
                copilotId: publication.copilotId,
                copilotModelId: publication.copilotModelId,
                modelType: publication.modelType
            },
            publicationOrganizationId
        )
        if (!target) {
            return {
                ...fallback,
                unavailableReason: ModelAccessUnavailableReasonEnum.ModelDeleted
            }
        }
        await this.lifecycle.processDueGrants({
            tenantId: input.tenantId,
            userId: input.userId,
            copilotId: publication.copilotId,
            copilotModelId: publication.copilotModelId,
            modelType: publication.modelType
        })
        const [grant, membershipAccess] = await Promise.all([
            this.records.findActiveGrant(target, input.userId, undefined, ModelAccessChannelEnum.ExternalApi),
            this.membershipService.findModelAccess({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                userId: input.userId
            })
        ])
        if (!grant) {
            return { ...fallback, accessSource: null }
        }
        if (!target.enabled) {
            await this.lifecycle.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.ModelDisabled)
            return {
                ...fallback,
                grantId: grant.id,
                unavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
            }
        }
        const quotaReason = await this.policy.resolveQuotaReason(membershipAccess)
        const planIncluded =
            !!membershipAccess &&
            this.membershipService.isModelAllowed(
                membershipAccess.membership.plan,
                target.provider,
                target.model,
                target.copilotId
            )
        const multiplier = planIncluded
            ? this.membershipService.resolveModelMultiplierForPlan(
                  membershipAccess.membership.plan,
                  target.provider,
                  target.model
              )
            : 1
        await this.lifecycle.recordGrantAvailability(grant, quotaReason)
        return {
            ...fallback,
            allowed: quotaReason === null,
            grantId: grant.id,
            planId: membershipAccess?.membership.planId,
            multiplier,
            unavailableReason: quotaReason
        }
    }
}
