import {
    AiFeatureEnum,
    AiModelTypeEnum,
    AIPermissionsEnum,
    IModelAccessAdminQuery,
    IModelAccessCatalog,
    IModelAccessCatalogItem,
    IModelAccessEvent,
    IModelAccessModelSnapshot,
    IModelAccessResolution,
    IModelAccessRequest,
    IModelGatewayCatalog,
    IModelGatewayCatalogItem,
    IUser,
    IUserModelGrant,
    ModelAccessActorTypeEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessChannelEnum,
    ModelAccessEventTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    ModelAccessSourceEnum,
    ModelAccessUnavailableReasonEnum,
    ModelFeature,
    TModelGatewayExternalRequestCreateInput,
    TModelAccessRequestApproveInput,
    TModelAccessRequestCreateInput,
    TModelAccessRequestRejectInput,
    TModelAccessRequestWithdrawInput,
    TUserModelGrantExtendInput,
    TUserModelGrantRevokeInput,
    UserModelGrantStatusEnum,
    UserType
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { FeatureOrganization, Organization, RequestContext, User } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm'
import { AIProvidersService } from '../ai-model'
import { Copilot } from '../copilot/copilot.entity'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot/queries/copilot-model-find.query'
import { CopilotWithProviderDto } from '../copilot/dto'
import { usesOrganizationCredentials } from '../copilot/utils'
import { CopilotProviderModel } from '../copilot-provider/models/copilot-provider-model.entity'
import { ExceedingLimitException } from '../core/errors'
import { MembershipModelAccess, MembershipService } from '../membership/membership.service'
import { endOfDayInTimeZone } from '../shared/utils'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { UserModelGrant } from './user-model-grant.entity'
import { ModelGatewayPublication } from '../model-gateway/model-gateway-publication.entity'

const MAX_PAGE_SIZE = 200
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const modelAccessEndOfDay = endOfDayInTimeZone

export type ModelAccessLifecycleBatchInput = {
    requestAfterId?: string | null
    grantAfterId?: string | null
    limit?: number
}

export type ModelAccessLifecycleBatchResult = {
    requests: number
    grants: number
    nextRequestAfterId: string | null
    nextGrantAfterId: string | null
}

type ModelTarget = {
    tenantId: string
    organizationId: string | null
    ownershipScope: ModelAccessOwnershipScopeEnum
    copilotId: string
    copilotModelId: string
    copilotName?: string | null
    provider: string
    providerLabel?: IModelAccessModelSnapshot['providerLabel']
    modelType: AiModelTypeEnum
    model: string
    modelLabel?: IModelAccessModelSnapshot['modelLabel']
    capabilities: ModelFeature[]
    deprecated: boolean
    enabled: boolean
    usesOrganizationCredentials: boolean
    listedForRequest?: boolean
}

enum ModelTargetAccessMode {
    Direct = 'direct',
    Membership = 'membership',
    Blocked = 'blocked'
}

type MembershipFeatureState = {
    organizationEnabled: boolean
    organizationModelsConfigured: boolean
    tenantEnabled: boolean
}

type ResolveModelInput = {
    tenantId: string
    organizationId?: string | null
    userId: string
    xpertId?: string | null
    copilotId: string
    copilotModelId: string
    modelType: AiModelTypeEnum
}

export type CatalogModelAccessBatchInput = Pick<
    ResolveModelInput,
    'tenantId' | 'organizationId' | 'userId' | 'xpertId'
> & {
    models: Array<Pick<ResolveModelInput, 'copilotId' | 'copilotModelId' | 'modelType'>>
}

type ModelAccessResolutionContext = {
    billableUserId: string
    runtimeOrganizationId: string | null
    membershipFeatureState: () => Promise<MembershipFeatureState>
    canManageMembership: () => Promise<boolean>
    membershipAccess: () => Promise<MembershipModelAccess | null>
    technicalUser: () => Promise<boolean>
    modelAccessFeatureEnabled: (organizationId: string | null) => Promise<boolean>
    quotaReason: (access: MembershipModelAccess | null) => Promise<ModelAccessUnavailableReasonEnum | null>
}

type EventInput = {
    tenantId: string
    organizationId: string | null
    requestId?: string | null
    grantId?: string | null
    eventType: ModelAccessEventTypeEnum
    actor?: IUser | null
    actorType?: ModelAccessActorTypeEnum
    fromStatus?: string | null
    toStatus?: string | null
    reason?: string | null
    systemReasonCode?: ModelAccessClosedReasonCodeEnum | null
    metadata?: IModelAccessEvent['metadata']
    idempotencyKey: string
    modelSnapshot: IModelAccessModelSnapshot
    channel?: ModelAccessChannelEnum
}

@Injectable()
export class ModelAccessService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(ModelAccessRequest)
        private readonly requestRepository: Repository<ModelAccessRequest>,
        @InjectRepository(UserModelGrant)
        private readonly grantRepository: Repository<UserModelGrant>,
        @InjectRepository(ModelAccessEvent)
        private readonly eventRepository: Repository<ModelAccessEvent>,
        @InjectRepository(ModelGatewayPublication)
        private readonly publicationRepository: Repository<ModelGatewayPublication>,
        @InjectRepository(Copilot)
        private readonly copilotRepository: Repository<Copilot>,
        @InjectRepository(CopilotProviderModel)
        private readonly providerModelRepository: Repository<CopilotProviderModel>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>,
        @InjectRepository(FeatureOrganization)
        private readonly featureOrganizationRepository: Repository<FeatureOrganization>,
        private readonly queryBus: QueryBus,
        private readonly providersService: AIProvidersService,
        private readonly membershipService: MembershipService
    ) {}

    async getCatalog(): Promise<IModelAccessCatalog> {
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        const organizationId = RequestContext.getOrganizationId()
        const user = await this.requireNormalUser(tenantId, userId, false)
        await this.processDueGrants({ tenantId, userId })

        const [
            visibleTargets,
            requests,
            initialGrants,
            membershipAccess,
            tenantFeatureEnabled,
            organizationFeatureEnabled,
            tenantMembershipEnabled,
            organizationMembershipEnabled,
            organizationModelsConfigured
        ] = await Promise.all([
            this.loadVisibleCatalogTargets(organizationId),
            this.findUserRequestsForCurrentContext(tenantId, userId, organizationId),
            this.findUserGrantsForCurrentContext(tenantId, userId, organizationId),
            this.membershipService.findModelAccess({ tenantId, organizationId, userId }),
            this.isModelAccessFeatureEnabled({
                tenantId,
                organizationId: null
            }),
            organizationId ? this.isModelAccessFeatureEnabled({ tenantId, organizationId }) : Promise.resolve(false),
            this.membershipService.isMembershipPlanEnabled({ tenantId, organizationId: null }),
            organizationId
                ? this.membershipService.isMembershipPlanEnabled({ tenantId, organizationId })
                : Promise.resolve(false),
            organizationId ? this.hasConfiguredOrganizationModels(tenantId, organizationId) : Promise.resolve(false)
        ])
        let grantStateChanged = false
        for (const grant of initialGrants.filter((item) => item.status === UserModelGrantStatusEnum.Active)) {
            if (await this.reconcileGrantAvailability(grant)) {
                grantStateChanged = true
            }
        }
        const grants = grantStateChanged
            ? await this.findUserGrantsForCurrentContext(tenantId, userId, organizationId)
            : initialGrants
        const targets = [...visibleTargets]
        for (const grant of grants.filter((item) => item.status === UserModelGrantStatusEnum.Active)) {
            if (targets.some((target) => this.sameModelTarget(grant, target))) {
                continue
            }
            const target = await this.loadTarget(
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
            await this.reconcilePendingRequest(request)
        }
        const effectiveRequests = pendingRequests.length
            ? await this.findUserRequestsForCurrentContext(tenantId, userId, organizationId)
            : requests

        const items = await Promise.all(
            targets.map((target) =>
                this.toCatalogItem(target, user, effectiveRequests, grants, membershipAccess, {
                    tenantFeatureEnabled,
                    organizationFeatureEnabled,
                    tenantMembershipEnabled,
                    organizationMembershipEnabled,
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
                  : items.some((item) => this.canManageTargetScope(item))
                    ? 'manager'
                    : null,
            tenantFeatureEnabled,
            organizationFeatureEnabled
        }
    }

    async getExternalCatalog(): Promise<IModelGatewayCatalog> {
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        const organizationId = RequestContext.getOrganizationId()
        const user = await this.requireNormalUser(tenantId, userId, false)
        await this.processDueGrants({ tenantId, userId })
        const [tenantFeatureEnabled, organizationFeatureEnabled, visibleTargets, requests, grants, membershipAccess] =
            await Promise.all([
                this.isModelGatewayFeatureEnabled({ tenantId, organizationId: null }),
                organizationId
                    ? this.isModelGatewayFeatureEnabled({ tenantId, organizationId })
                    : Promise.resolve(false),
                this.loadVisibleCatalogTargets(organizationId),
                this.findUserRequestsForCurrentContext(
                    tenantId,
                    userId,
                    organizationId,
                    ModelAccessChannelEnum.ExternalApi
                ),
                this.findUserGrantsForCurrentContext(
                    tenantId,
                    userId,
                    organizationId,
                    ModelAccessChannelEnum.ExternalApi
                ),
                this.membershipService.findModelAccess({ tenantId, organizationId, userId })
            ])
        const targets = visibleTargets.filter((target) => target.modelType === AiModelTypeEnum.LLM)
        const publications = await this.ensureAutomaticPublications(targets)
        const userEligible =
            user.type !== UserType.COMMUNICATION && this.userHasPermission(user, AIPermissionsEnum.MODEL_GATEWAY_USE)
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
                        this.sameModelTarget(request, target) &&
                        request.status === ModelAccessRequestStatusEnum.Requested
                ) ?? null
            const grant =
                grants.find(
                    (item) =>
                        !!target &&
                        this.sameModelTarget(item, target) &&
                        item.status === UserModelGrantStatusEnum.Active &&
                        (!item.validUntil || new Date(item.validUntil).getTime() > Date.now())
                ) ?? null
            const planIncluded =
                !!target &&
                !!membershipAccess &&
                this.membershipService.isModelAllowed(membershipAccess.membership.plan, target.provider, target.model)
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
        const tenantId = this.requireTenant()
        const requesterId = this.requireUser()
        const requestedFromOrganizationId = RequestContext.getOrganizationId()
        const requester = await this.requireNormalUser(tenantId, requesterId)
        const target = await this.requireVisibleEnabledTarget({
            tenantId,
            organizationId: requestedFromOrganizationId,
            copilotId: input.copilotId,
            copilotModelId: input.copilotModelId,
            modelType: input.modelType
        })
        await this.assertExternalGatewayEligibility(
            { tenantId, organizationId: requestedFromOrganizationId },
            requester
        )
        if (target.organizationId !== requestedFromOrganizationId) {
            await this.assertModelGatewayFeatureEnabled({ tenantId, organizationId: target.organizationId })
        }
        if (target.modelType !== AiModelTypeEnum.LLM) {
            throw new BadRequestException(
                this.translate(
                    'server-ai:Error.ModelGatewayChatOnly',
                    'The model gateway only supports chat language models.'
                )
            )
        }
        const reason = this.requireText(
            input.reason,
            'server-ai:Error.ModelAccessRequestReasonRequired',
            'Request reason is required.'
        )
        const [publication] = await this.ensureAutomaticPublications([target])
        await this.processDueGrants({
            tenantId,
            userId: requesterId,
            copilotId: target.copilotId,
            copilotModelId: target.copilotModelId,
            modelType: target.modelType
        })
        const activeGrant = await this.findActiveGrant(
            target,
            requesterId,
            undefined,
            ModelAccessChannelEnum.ExternalApi
        )
        if (activeGrant) {
            return this.attachEventsToGrant(activeGrant)
        }
        const existing = await this.findPendingRequest(target, requesterId, ModelAccessChannelEnum.ExternalApi)
        if (existing) {
            return this.attachEventsToRequest(existing)
        }

        const snapshot = { ...this.snapshot(target), externalModelId: publication.externalModelId }
        let saved: ModelAccessRequest
        try {
            saved = await this.dataSource.transaction(async (manager) => {
                const request = manager.getRepository(ModelAccessRequest).create({
                    tenantId,
                    organizationId: target.organizationId,
                    channel: ModelAccessChannelEnum.ExternalApi,
                    requesterId,
                    requesterName: this.userName(requester),
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
                await this.writeEvent(manager, {
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
            if (this.isUniqueViolation(error)) {
                const duplicate = await this.findPendingRequest(target, requesterId, ModelAccessChannelEnum.ExternalApi)
                if (duplicate) {
                    return this.attachEventsToRequest(duplicate)
                }
            }
            throw error
        }

        if (this.canManageTargetScope(target)) {
            const grant = await this.approveRequest(saved.id, {
                note: this.translate(
                    'server-ai:ModelGateway.PrivilegedRequestApproved',
                    'Approved automatically for a model access administrator.'
                )
            })
            return grant ?? this.attachEventsToRequest(saved)
        }
        return this.attachEventsToRequest(saved)
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
        const user = await this.requireNormalUser(input.tenantId, input.userId, false)
        const [keyScopeFeatureEnabled, publicationScopeFeatureEnabled] = await Promise.all([
            this.isModelGatewayFeatureEnabled({
                tenantId: input.tenantId,
                organizationId: input.organizationId
            }),
            publicationOrganizationId === input.organizationId
                ? Promise.resolve(true)
                : this.isModelGatewayFeatureEnabled({
                      tenantId: input.tenantId,
                      organizationId: publicationOrganizationId
                  })
        ])
        if (
            user.type === UserType.COMMUNICATION ||
            !keyScopeFeatureEnabled ||
            !publicationScopeFeatureEnabled ||
            !this.userHasPermission(user, AIPermissionsEnum.MODEL_GATEWAY_USE)
        ) {
            return { ...fallback, unavailableReason: ModelAccessUnavailableReasonEnum.ExternalApiIneligible }
        }
        const target = await this.loadTarget(
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
        await this.processDueGrants({
            tenantId: input.tenantId,
            userId: input.userId,
            copilotId: publication.copilotId,
            copilotModelId: publication.copilotModelId,
            modelType: publication.modelType
        })
        const [grant, membershipAccess] = await Promise.all([
            this.findActiveGrant(target, input.userId, undefined, ModelAccessChannelEnum.ExternalApi),
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
            await this.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.ModelDisabled)
            return {
                ...fallback,
                grantId: grant.id,
                unavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
            }
        }
        const quotaReason = await this.resolveQuotaReason(membershipAccess)
        const planIncluded =
            !!membershipAccess &&
            this.membershipService.isModelAllowed(membershipAccess.membership.plan, target.provider, target.model)
        const multiplier = planIncluded
            ? this.membershipService.resolveModelMultiplierForPlan(
                  membershipAccess.membership.plan,
                  target.provider,
                  target.model
              )
            : 1
        await this.recordGrantAvailability(grant, quotaReason)
        return {
            ...fallback,
            allowed: quotaReason === null,
            grantId: grant.id,
            planId: membershipAccess?.membership.planId,
            multiplier,
            unavailableReason: quotaReason
        }
    }

    async createRequest(input: TModelAccessRequestCreateInput): Promise<IModelAccessRequest> {
        const tenantId = this.requireTenant()
        const requesterId = this.requireUser()
        const requestedFromOrganizationId = RequestContext.getOrganizationId()
        const requester = await this.requireNormalUser(tenantId, requesterId)
        const target = await this.requireVisibleEnabledTarget({
            tenantId,
            organizationId: requestedFromOrganizationId,
            copilotId: input.copilotId,
            copilotModelId: input.copilotModelId,
            modelType: input.modelType
        })
        await this.assertRequestFeatureEnabled(target)
        this.assertRequesterIsNotManager(target)

        const reason = this.requireText(
            input.reason,
            'server-ai:Error.ModelAccessRequestReasonRequired',
            'Request reason is required.'
        )
        const membershipAccess = await this.membershipService.findModelAccess({
            tenantId,
            organizationId: requestedFromOrganizationId,
            userId: requesterId
        })
        if (this.isPlanIncluded(target, membershipAccess)) {
            throw new BadRequestException(
                this.translate(
                    'server-ai:Error.ModelAccessPlanIncluded',
                    'The membership plan already includes this model.'
                )
            )
        }

        await this.processDueGrants({
            tenantId,
            userId: requesterId,
            copilotId: target.copilotId,
            copilotModelId: target.copilotModelId,
            modelType: target.modelType
        })
        const activeGrant = await this.findActiveGrant(target, requesterId)
        if (activeGrant) {
            throw new BadRequestException(
                this.translate('server-ai:Error.ModelAccessAlreadyGranted', 'This model is already granted.')
            )
        }

        const existing = await this.findPendingRequest(target, requesterId)
        if (existing) {
            return this.attachEventsToRequest(existing)
        }

        const snapshot = this.snapshot(target)
        try {
            return await this.dataSource.transaction(async (manager) => {
                const request = manager.getRepository(ModelAccessRequest).create({
                    tenantId,
                    channel: ModelAccessChannelEnum.Xpert,
                    organizationId: target.organizationId,
                    requesterId,
                    requesterName: this.userName(requester),
                    requestedFromOrganizationId,
                    copilotId: target.copilotId,
                    copilotModelId: target.copilotModelId,
                    provider: target.provider,
                    modelType: target.modelType,
                    model: target.model,
                    ownershipScope: target.ownershipScope,
                    reason,
                    status: ModelAccessRequestStatusEnum.Requested,
                    modelSnapshot: snapshot
                })
                const saved = await manager.getRepository(ModelAccessRequest).save(request)
                await this.writeEvent(manager, {
                    tenantId,
                    organizationId: target.organizationId,
                    requestId: saved.id,
                    eventType: ModelAccessEventTypeEnum.Requested,
                    actor: requester,
                    fromStatus: null,
                    toStatus: ModelAccessRequestStatusEnum.Requested,
                    reason,
                    idempotencyKey: `request:${saved.id}:requested`,
                    modelSnapshot: snapshot
                })
                return this.attachEventsToRequest(saved, manager)
            })
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                const duplicate = await this.findPendingRequest(target, requesterId)
                if (duplicate) {
                    return this.attachEventsToRequest(duplicate)
                }
            }
            throw error
        }
    }

    async findMyRequests(channel = ModelAccessChannelEnum.Xpert): Promise<IModelAccessRequest[]> {
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        await this.requireNormalUser(tenantId, userId, false)
        const organizationId = RequestContext.getOrganizationId()
        const requests = await this.findUserRequestsForCurrentContext(tenantId, userId, organizationId, channel)
        for (const request of requests.filter((item) => item.status === ModelAccessRequestStatusEnum.Requested)) {
            await this.reconcilePendingRequest(request)
        }
        const refreshed = await this.findUserRequestsForCurrentContext(tenantId, userId, organizationId, channel)
        return Promise.all(refreshed.map((request) => this.attachEventsToRequest(request)))
    }

    async withdrawRequest(
        id: string,
        input?: TModelAccessRequestWithdrawInput,
        channel = ModelAccessChannelEnum.Xpert
    ): Promise<IModelAccessRequest> {
        const tenantId = this.requireTenant()
        const requesterId = this.requireUser()
        const actor = await this.requireNormalUser(tenantId, requesterId)
        const reason = this.optionalText(input?.reason)

        return this.dataSource.transaction(async (manager) => {
            const request = await this.findRequestForUpdate(manager, id, tenantId)
            if ((request.channel ?? ModelAccessChannelEnum.Xpert) !== channel) {
                throw new NotFoundException(
                    this.translate('server-ai:Error.ModelAccessRequestNotFound', 'Model access request not found.')
                )
            }
            if (request.requesterId !== requesterId) {
                throw new ForbiddenException(
                    this.translate('server-ai:Error.ModelAccessWithdrawForbidden', 'You cannot withdraw this request.')
                )
            }
            if (request.status === ModelAccessRequestStatusEnum.Withdrawn) {
                return this.attachEventsToRequest(request, manager)
            }
            this.assertRequestStatus(request, ModelAccessRequestStatusEnum.Requested)
            const fromStatus = request.status
            request.status = ModelAccessRequestStatusEnum.Withdrawn
            request.decidedAt = new Date()
            request.decisionReason = reason
            const saved = await manager.getRepository(ModelAccessRequest).save(request)
            await this.writeEvent(manager, {
                tenantId,
                organizationId: request.organizationId ?? null,
                requestId: request.id,
                eventType: ModelAccessEventTypeEnum.Withdrawn,
                actor,
                fromStatus,
                toStatus: saved.status,
                reason,
                idempotencyKey: `request:${request.id}:withdrawn`,
                modelSnapshot: request.modelSnapshot
            })
            return this.attachEventsToRequest(saved, manager)
        })
    }

    async findMyGrants(channel = ModelAccessChannelEnum.Xpert): Promise<IUserModelGrant[]> {
        const tenantId = this.requireTenant()
        const userId = this.requireUser()
        await this.requireNormalUser(tenantId, userId, false)
        await this.processDueGrants({ tenantId, userId })
        const organizationId = RequestContext.getOrganizationId()
        const grants = await this.findUserGrantsForCurrentContext(tenantId, userId, organizationId, channel)
        for (const grant of grants.filter((item) => item.status === UserModelGrantStatusEnum.Active)) {
            await this.reconcileGrantAvailability(grant)
        }
        const refreshed = await this.findUserGrantsForCurrentContext(tenantId, userId, organizationId, channel)
        return Promise.all(refreshed.map((grant) => this.attachEventsToGrant(grant)))
    }

    async findAdminRequests(query: IModelAccessAdminQuery = {}) {
        await this.assertAdminChannelFeatureEnabled(query.channel)
        const scope = this.currentScope()
        const take = this.pageSize(query.take)
        const skip = this.pageOffset(query.skip)
        const qb = this.requestRepository
            .createQueryBuilder('request')
            .where('request.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('request.createdAt', 'DESC')
            .take(take)
            .skip(skip)
        this.applyScopeFilter(qb, 'request.organizationId', scope.organizationId)
        this.applyAdminFilters(qb, 'request', query)
        let [items, total] = await qb.getManyAndCount()
        const pendingRequests = items.filter((item) => item.status === ModelAccessRequestStatusEnum.Requested)
        for (const request of pendingRequests) {
            await this.reconcilePendingRequest(request)
        }
        if (pendingRequests.length) {
            const refreshed = await qb.getManyAndCount()
            items = refreshed[0]
            total = refreshed[1]
        }
        return {
            items: await Promise.all(items.map((request) => this.attachEventsToRequest(request))),
            total
        }
    }

    async findAdminGrants(query: IModelAccessAdminQuery = {}) {
        await this.assertAdminChannelFeatureEnabled(query.channel)
        const scope = this.currentScope()
        await this.processDueGrants(scope)
        const take = this.pageSize(query.take)
        const skip = this.pageOffset(query.skip)
        const qb = this.grantRepository
            .createQueryBuilder('grant')
            .where('grant.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('grant.createdAt', 'DESC')
            .take(take)
            .skip(skip)
        this.applyScopeFilter(qb, 'grant.organizationId', scope.organizationId)
        const expiresBefore = query.expiresBefore
            ? await this.normalizeAdminExpiresBefore(query.expiresBefore, scope.tenantId)
            : undefined
        this.applyAdminFilters(qb, 'grant', query, expiresBefore)
        const [items, total] = await qb.getManyAndCount()
        return {
            items: await Promise.all(items.map((grant) => this.attachEventsToGrant(grant))),
            total
        }
    }

    async findAdminEvents(query: IModelAccessAdminQuery = {}) {
        await this.assertAdminChannelFeatureEnabled(query.channel)
        const scope = this.currentScope()
        const take = this.pageSize(query.take)
        const skip = this.pageOffset(query.skip)
        const qb = this.eventRepository
            .createQueryBuilder('event')
            .leftJoin(
                ModelAccessRequest,
                'request',
                'request.id = event.requestId AND request.tenantId = event.tenantId'
            )
            .leftJoin(UserModelGrant, 'grant', 'grant.id = event.grantId AND grant.tenantId = event.tenantId')
            .where('event.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('event.createdAt', 'DESC')
            .take(take)
            .skip(skip)
        this.applyScopeFilter(qb, 'event.organizationId', scope.organizationId)
        if (query.search?.trim()) {
            qb.andWhere(
                new Brackets((searchQb) => {
                    searchQb
                        .where('LOWER(event.actorName) LIKE :search')
                        .orWhere('LOWER(request.requesterName) LIKE :search')
                        .orWhere('LOWER(grant.userName) LIKE :search')
                        .orWhere('LOWER(event.reason) LIKE :search')
                        .orWhere("LOWER(event.modelSnapshot ->> 'model') LIKE :search")
                        .orWhere("LOWER(event.modelSnapshot ->> 'provider') LIKE :search")
                })
            ).setParameter('search', `%${query.search.trim().toLowerCase()}%`)
        }
        if (query.modelType) {
            qb.andWhere("event.modelSnapshot ->> 'modelType' = :modelType", { modelType: query.modelType })
        }
        if (query.channel) {
            qb.andWhere('event.channel = :channel', { channel: query.channel })
        }
        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async approveRequest(id: string, input: TModelAccessRequestApproveInput): Promise<IUserModelGrant | null> {
        const actor = this.requireActor()
        const note = this.optionalText(input.note)

        return this.dataSource.transaction(async (manager) => {
            const request = await this.findRequestForAdminUpdate(manager, id)
            const channel = request.channel ?? ModelAccessChannelEnum.Xpert
            if (request.status === ModelAccessRequestStatusEnum.Approved) {
                const existing = await manager.getRepository(UserModelGrant).findOne({
                    where: { tenantId: request.tenantId, requestId: request.id }
                })
                return existing ? this.attachEventsToGrant(existing, manager) : null
            }
            if (channel === ModelAccessChannelEnum.ExternalApi) {
                await this.assertModelGatewayFeatureEnabled(
                    {
                        tenantId: request.tenantId,
                        organizationId: request.organizationId ?? null
                    },
                    manager
                )
            } else {
                await this.assertCurrentAdminFeatureEnabled(manager)
            }
            const validUntil = await this.normalizeValidUntil(input.validUntil, manager)
            this.assertRequestStatus(request, ModelAccessRequestStatusEnum.Requested)
            await this.requireNormalUser(request.tenantId, request.requesterId)
            const target = await this.targetFromRequest(request)
            if (!target) {
                await this.closeRequestForSystem(
                    request,
                    ModelAccessClosedReasonCodeEnum.ModelDeleted,
                    ModelAccessEventTypeEnum.ModelDeleted,
                    manager
                )
                return null
            }
            if (!target.enabled) {
                throw new BadRequestException(
                    this.translate('server-ai:Error.ModelAccessModelDisabled', 'The model is currently disabled.')
                )
            }
            if (channel === ModelAccessChannelEnum.ExternalApi) {
                const [publication] = await this.ensureAutomaticPublications([target], manager)
                request.gatewayPublicationId = publication.id
                request.externalModelId = publication.externalModelId
                request.modelSnapshot = {
                    ...request.modelSnapshot,
                    externalModelId: publication.externalModelId
                }
            } else {
                await this.assertRequestFeatureEnabled(target, manager)
            }
            const membershipAccess = await this.membershipService.findModelAccess(
                {
                    tenantId: request.tenantId,
                    organizationId: request.requestedFromOrganizationId,
                    userId: request.requesterId
                },
                manager
            )
            if (channel === ModelAccessChannelEnum.Xpert && this.isPlanIncluded(target, membershipAccess)) {
                await this.closeRequestForSystem(
                    request,
                    ModelAccessClosedReasonCodeEnum.PlanIncluded,
                    ModelAccessEventTypeEnum.SystemClosed,
                    manager
                )
                return null
            }

            await this.expireDueGrantsForModel(manager, target, request.requesterId)
            const activeGrant = await this.findActiveGrant(target, request.requesterId, manager, channel)
            if (activeGrant) {
                request.status = ModelAccessRequestStatusEnum.Approved
                request.decidedAt = activeGrant.approvedAt
                request.decidedById = activeGrant.approvedById
                request.decidedByName = activeGrant.approvedByName
                await manager.getRepository(ModelAccessRequest).save(request)
                return this.attachEventsToGrant(activeGrant, manager)
            }

            const decidedAt = new Date()
            const fromStatus = request.status
            request.status = ModelAccessRequestStatusEnum.Approved
            request.decidedAt = decidedAt
            request.decidedById = actor.id
            request.decidedByName = this.userName(actor)
            request.decisionReason = note
            request.requestedValidUntil = validUntil
            await manager.getRepository(ModelAccessRequest).save(request)

            const grant = await manager.getRepository(UserModelGrant).save(
                manager.getRepository(UserModelGrant).create({
                    tenantId: request.tenantId,
                    channel,
                    organizationId: request.organizationId ?? null,
                    userId: request.requesterId,
                    userName: request.requesterName,
                    requestId: request.id,
                    copilotId: request.copilotId,
                    copilotModelId: request.copilotModelId,
                    provider: request.provider,
                    modelType: request.modelType,
                    model: request.model,
                    ownershipScope: request.ownershipScope,
                    status: UserModelGrantStatusEnum.Active,
                    validUntil,
                    approvedAt: decidedAt,
                    approvedById: actor.id,
                    approvedByName: this.userName(actor),
                    gatewayPublicationId: request.gatewayPublicationId,
                    externalModelId: request.externalModelId,
                    modelSnapshot: request.modelSnapshot
                })
            )
            await this.writeEvent(manager, {
                tenantId: request.tenantId,
                organizationId: request.organizationId ?? null,
                requestId: request.id,
                grantId: grant.id,
                eventType: ModelAccessEventTypeEnum.Approved,
                actor,
                fromStatus,
                toStatus: request.status,
                reason: note,
                metadata: { validUntil: validUntil?.toISOString() ?? null },
                idempotencyKey: `request:${request.id}:approved`,
                modelSnapshot: request.modelSnapshot
            })
            await this.writeEvent(manager, {
                tenantId: request.tenantId,
                organizationId: request.organizationId ?? null,
                requestId: request.id,
                grantId: grant.id,
                eventType: ModelAccessEventTypeEnum.GrantActivated,
                actor,
                fromStatus: null,
                toStatus: grant.status,
                reason: note,
                metadata: { validUntil: validUntil?.toISOString() ?? null },
                idempotencyKey: `grant:${grant.id}:active`,
                modelSnapshot: request.modelSnapshot
            })
            return this.attachEventsToGrant(grant, manager)
        })
    }

    async rejectRequest(id: string, input: TModelAccessRequestRejectInput): Promise<IModelAccessRequest> {
        const actor = this.requireActor()
        const reason = this.requireText(
            input.reason,
            'server-ai:Error.ModelAccessRejectionReasonRequired',
            'Rejection reason is required.'
        )
        return this.dataSource.transaction(async (manager) => {
            const request = await this.findRequestForAdminUpdate(manager, id)
            await this.assertAdminChannelFeatureEnabled(request.channel ?? ModelAccessChannelEnum.Xpert, manager)
            if (request.status === ModelAccessRequestStatusEnum.Rejected) {
                return this.attachEventsToRequest(request, manager)
            }
            this.assertRequestStatus(request, ModelAccessRequestStatusEnum.Requested)
            const fromStatus = request.status
            request.status = ModelAccessRequestStatusEnum.Rejected
            request.decidedAt = new Date()
            request.decidedById = actor.id
            request.decidedByName = this.userName(actor)
            request.decisionReason = reason
            const saved = await manager.getRepository(ModelAccessRequest).save(request)
            await this.writeEvent(manager, {
                tenantId: request.tenantId,
                organizationId: request.organizationId ?? null,
                requestId: request.id,
                eventType: ModelAccessEventTypeEnum.Rejected,
                actor,
                fromStatus,
                toStatus: saved.status,
                reason,
                idempotencyKey: `request:${request.id}:rejected`,
                modelSnapshot: request.modelSnapshot
            })
            return this.attachEventsToRequest(saved, manager)
        })
    }

    async extendGrant(id: string, input: TUserModelGrantExtendInput): Promise<IUserModelGrant> {
        await this.processDueGrants(this.currentScope())
        const actor = this.requireActor()
        const note = this.optionalText(input.note)
        return this.dataSource.transaction(async (manager) => {
            const grant = await this.findGrantForAdminUpdate(manager, id)
            await this.assertAdminChannelFeatureEnabled(grant.channel ?? ModelAccessChannelEnum.Xpert, manager)
            const validUntil = await this.normalizeValidUntil(input.validUntil, manager)
            if (grant.status !== UserModelGrantStatusEnum.Active) {
                throw new BadRequestException(
                    this.translate('server-ai:Error.ModelAccessGrantNotActive', 'Only active grants can be extended.')
                )
            }
            if (!grant.validUntil) {
                throw new BadRequestException(
                    this.translate(
                        'server-ai:Error.ModelAccessGrantAlreadyPermanent',
                        'The grant is already permanent.'
                    )
                )
            }
            if (validUntil && validUntil.getTime() <= new Date(grant.validUntil).getTime()) {
                throw new BadRequestException(
                    this.translate(
                        'server-ai:Error.ModelAccessGrantCannotShorten',
                        'The new expiration must be later than the current expiration.'
                    )
                )
            }
            const previousValidUntil = new Date(grant.validUntil)
            grant.validUntil = validUntil
            const saved = await manager.getRepository(UserModelGrant).save(grant)
            await this.writeEvent(manager, {
                tenantId: grant.tenantId,
                organizationId: grant.organizationId ?? null,
                requestId: grant.requestId,
                grantId: grant.id,
                eventType: ModelAccessEventTypeEnum.Extended,
                actor,
                fromStatus: grant.status,
                toStatus: grant.status,
                reason: note,
                metadata: {
                    previousValidUntil: previousValidUntil.toISOString(),
                    validUntil: validUntil?.toISOString() ?? null
                },
                idempotencyKey: `grant:${grant.id}:extend:${validUntil?.toISOString() ?? 'permanent'}`,
                modelSnapshot: grant.modelSnapshot
            })
            return this.attachEventsToGrant(saved, manager)
        })
    }

    async revokeGrant(id: string, input: TUserModelGrantRevokeInput): Promise<IUserModelGrant> {
        await this.processDueGrants(this.currentScope())
        const actor = this.requireActor()
        const reason = this.requireText(
            input.reason,
            'server-ai:Error.ModelAccessRevocationReasonRequired',
            'Revocation reason is required.'
        )
        return this.dataSource.transaction(async (manager) => {
            const grant = await this.findGrantForAdminUpdate(manager, id)
            await this.assertAdminChannelFeatureEnabled(grant.channel ?? ModelAccessChannelEnum.Xpert, manager)
            if (grant.status === UserModelGrantStatusEnum.Revoked) {
                return this.attachEventsToGrant(grant, manager)
            }
            if (grant.status !== UserModelGrantStatusEnum.Active) {
                throw new BadRequestException(
                    this.translate('server-ai:Error.ModelAccessGrantNotActive', 'Only active grants can be revoked.')
                )
            }
            const fromStatus = grant.status
            grant.status = UserModelGrantStatusEnum.Revoked
            grant.revokedAt = new Date()
            grant.revokedById = actor.id
            grant.revokedByName = this.userName(actor)
            grant.revokeReason = reason
            const saved = await manager.getRepository(UserModelGrant).save(grant)
            await this.writeEvent(manager, {
                tenantId: grant.tenantId,
                organizationId: grant.organizationId ?? null,
                requestId: grant.requestId,
                grantId: grant.id,
                eventType: ModelAccessEventTypeEnum.Revoked,
                actor,
                fromStatus,
                toStatus: saved.status,
                reason,
                idempotencyKey: `grant:${grant.id}:revoked`,
                modelSnapshot: grant.modelSnapshot
            })
            return this.attachEventsToGrant(saved, manager)
        })
    }

    async resolveModelAccess(input: ResolveModelInput): Promise<IModelAccessResolution> {
        const billableUserId = await this.membershipService.resolveBillableUserId({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId
        })
        const runtimeOrganizationId = input.organizationId ?? null

        await this.processDueGrants({
            tenantId: input.tenantId,
            userId: billableUserId,
            copilotId: input.copilotId,
            copilotModelId: input.copilotModelId,
            modelType: input.modelType
        })
        const target = await this.loadTarget(input, runtimeOrganizationId)
        const grant = await this.findActiveGrantByInput(input, billableUserId)

        return this.resolveModelAccessWithContext(input, target, grant, {
            billableUserId,
            runtimeOrganizationId,
            membershipFeatureState: () => this.resolveMembershipFeatureState(input.tenantId, runtimeOrganizationId),
            canManageMembership: () =>
                this.hasUserPermission(input.tenantId, billableUserId, AIPermissionsEnum.MEMBERSHIP_EDIT),
            membershipAccess: () =>
                this.membershipService.findModelAccess({
                    tenantId: input.tenantId,
                    organizationId: runtimeOrganizationId,
                    userId: billableUserId
                }),
            technicalUser: () => this.isTechnicalUser(input.tenantId, billableUserId),
            modelAccessFeatureEnabled: (organizationId) =>
                this.isModelAccessFeatureEnabled({ tenantId: input.tenantId, organizationId }),
            quotaReason: (access) => this.resolveQuotaReason(access)
        })
    }

    async canUseCatalogModels(input: CatalogModelAccessBatchInput): Promise<boolean[]> {
        if (!input.models.length) {
            return []
        }
        const billableUserId = await this.membershipService.resolveBillableUserId({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId
        })
        const runtimeOrganizationId = input.organizationId ?? null
        const modelTypes = new Set(input.models.map((model) => model.modelType))
        await this.processDueGrants({
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
            this.loadTargets(resolveInputs, runtimeOrganizationId),
            this.findUserGrantsForCurrentContext(input.tenantId, billableUserId, runtimeOrganizationId)
        ])
        const activeGrants = grants.filter((grant) => grant.status === UserModelGrantStatusEnum.Active)

        let membershipFeatureStatePromise: Promise<MembershipFeatureState> | null = null
        let membershipAccessPromise: Promise<MembershipModelAccess | null> | null = null
        let quotaReasonPromise: Promise<ModelAccessUnavailableReasonEnum | null> | null = null
        let userStatePromise: Promise<{ canManageMembership: boolean; technicalUser: boolean }> | null = null
        const featureEnabledByScope = new Map<string | null, Promise<boolean>>()
        const userState = () =>
            (userStatePromise ??= this.userRepository
                .findOne({
                    where: { tenantId: input.tenantId, id: billableUserId },
                    relations: ['role', 'role.rolePermissions']
                })
                .then((user) => ({
                    canManageMembership:
                        !!user && this.userHasPermission(user, AIPermissionsEnum.MEMBERSHIP_EDIT) === true,
                    technicalUser: user?.type === UserType.COMMUNICATION
                })))
        const context: ModelAccessResolutionContext = {
            billableUserId,
            runtimeOrganizationId,
            membershipFeatureState: () =>
                (membershipFeatureStatePromise ??= this.resolveMembershipFeatureState(
                    input.tenantId,
                    runtimeOrganizationId
                )),
            canManageMembership: async () => (await userState()).canManageMembership,
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
                    enabled = this.isModelAccessFeatureEnabled({ tenantId: input.tenantId, organizationId })
                    featureEnabledByScope.set(organizationId, enabled)
                }
                return enabled
            },
            quotaReason: (access) => (quotaReasonPromise ??= this.resolveQuotaReason(access))
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

    private async resolveModelAccessWithContext(
        input: ResolveModelInput,
        target: ModelTarget | null,
        grant: UserModelGrant | null | undefined,
        context: ModelAccessResolutionContext
    ): Promise<IModelAccessResolution> {
        const fallbackScope = ModelAccessOwnershipScopeEnum.Tenant
        if (!target) {
            if (grant) {
                await this.revokeGrantForDeletedModel(grant)
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
        const canManageMembership =
            !target.usesOrganizationCredentials || !membershipFeatureState.organizationEnabled
                ? true
                : await context.canManageMembership()
        const accessMode = this.resolveTargetAccessMode(
            target,
            context.runtimeOrganizationId,
            membershipFeatureState,
            canManageMembership
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
                await this.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.FeatureDisabled)
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
        if (this.isPlanIncluded(target, membershipAccess)) {
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
                organizationId: target.organizationId
            }
        }

        if (await context.technicalUser()) {
            await this.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.TechnicalUser)
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
        await this.recordGrantAvailability(grant, unavailableReason)
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
                this.translate(
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

    async processDueGrants(filter: {
        tenantId: string
        organizationId?: string | null
        userId?: string
        copilotId?: string
        copilotModelId?: string
        modelType?: AiModelTypeEnum
    }): Promise<number> {
        const now = new Date()
        return this.dataSource.transaction(async (manager) => {
            const qb = manager
                .getRepository(UserModelGrant)
                .createQueryBuilder('grant')
                .setLock('pessimistic_write')
                .where('grant.tenantId = :tenantId', { tenantId: filter.tenantId })
                .andWhere('grant.status = :status', { status: UserModelGrantStatusEnum.Active })
                .andWhere('grant.validUntil IS NOT NULL')
                .andWhere('grant.validUntil < :now', { now })
                .take(500)
            if (Object.prototype.hasOwnProperty.call(filter, 'organizationId')) {
                this.applyScopeFilter(qb, 'grant.organizationId', filter.organizationId ?? null)
            }
            if (filter.userId) {
                qb.andWhere('grant.userId = :userId', { userId: filter.userId })
            }
            if (filter.copilotId) {
                qb.andWhere('grant.copilotId = :copilotId', { copilotId: filter.copilotId })
            }
            if (filter.copilotModelId) {
                qb.andWhere('grant.copilotModelId = :copilotModelId', {
                    copilotModelId: filter.copilotModelId
                })
            }
            if (filter.modelType) {
                qb.andWhere('grant.modelType = :modelType', { modelType: filter.modelType })
            }
            const grants = await qb.getMany()
            for (const grant of grants) {
                const fromStatus = grant.status
                grant.status = UserModelGrantStatusEnum.Expired
                await manager.getRepository(UserModelGrant).save(grant)
                await this.writeEvent(manager, {
                    tenantId: grant.tenantId,
                    organizationId: grant.organizationId ?? null,
                    requestId: grant.requestId,
                    grantId: grant.id,
                    eventType: ModelAccessEventTypeEnum.GrantExpired,
                    actorType: ModelAccessActorTypeEnum.System,
                    fromStatus,
                    toStatus: grant.status,
                    reason: this.translate(
                        'server-ai:Error.ModelAccessGrantExpiredReason',
                        'Grant validity period ended.'
                    ),
                    idempotencyKey: `grant:${grant.id}:expired`,
                    modelSnapshot: grant.modelSnapshot
                })
            }
            return grants.length
        })
    }

    async processAllDueGrants(): Promise<number> {
        const rows = await this.grantRepository
            .createQueryBuilder('grant')
            .select('DISTINCT grant.tenantId', 'tenantId')
            .where('grant.status = :status', { status: UserModelGrantStatusEnum.Active })
            .andWhere('grant.validUntil IS NOT NULL')
            .andWhere('grant.validUntil < :now', { now: new Date() })
            .getRawMany<{ tenantId: string }>()
        let expired = 0
        for (const row of rows) {
            if (row.tenantId) {
                expired += await this.processDueGrants({ tenantId: row.tenantId })
            }
        }
        return expired
    }

    async reconcileLifecycleBatch(
        input: ModelAccessLifecycleBatchInput = {}
    ): Promise<ModelAccessLifecycleBatchResult> {
        const limit = Math.max(1, Math.min(input.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE))
        const requestQuery = this.requestRepository
            .createQueryBuilder('request')
            .where('request.status = :status', { status: ModelAccessRequestStatusEnum.Requested })
        if (input.requestAfterId) {
            requestQuery.andWhere('request.id > :requestAfterId', {
                requestAfterId: input.requestAfterId
            })
        }
        const requests = await requestQuery.orderBy('request.id', 'ASC').take(limit).getMany()
        let changedRequests = 0
        for (const request of requests) {
            if (await this.reconcilePendingRequest(request)) {
                changedRequests += 1
            }
        }

        const grantQuery = this.grantRepository
            .createQueryBuilder('grant')
            .where('grant.status = :status', { status: UserModelGrantStatusEnum.Active })
        if (input.grantAfterId) {
            grantQuery.andWhere('grant.id > :grantAfterId', {
                grantAfterId: input.grantAfterId
            })
        }
        const grants = await grantQuery.orderBy('grant.id', 'ASC').take(limit).getMany()
        let changedGrants = 0
        for (const grant of grants) {
            if (await this.reconcileGrantAvailability(grant)) {
                changedGrants += 1
            }
        }

        return {
            requests: changedRequests,
            grants: changedGrants,
            nextRequestAfterId: requests.length === limit ? (requests.at(-1)?.id ?? null) : null,
            nextGrantAfterId: grants.length === limit ? (grants.at(-1)?.id ?? null) : null
        }
    }

    async closeOrganizationAccessForRemovedUser(input: {
        tenantId: string
        organizationId: string
        userId: string
    }): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            const requests = await manager.getRepository(ModelAccessRequest).find({
                where: {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    requesterId: input.userId,
                    status: ModelAccessRequestStatusEnum.Requested
                }
            })
            for (const request of requests) {
                await this.closeRequestForSystem(
                    request,
                    ModelAccessClosedReasonCodeEnum.UserLeftOrganization,
                    ModelAccessEventTypeEnum.UserLeftOrganization,
                    manager
                )
            }

            const grants = await manager.getRepository(UserModelGrant).find({
                where: {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    userId: input.userId,
                    status: UserModelGrantStatusEnum.Active
                }
            })
            for (const grant of grants) {
                const fromStatus = grant.status
                grant.status = UserModelGrantStatusEnum.Revoked
                grant.revokedAt = new Date()
                grant.revokeReason = ModelAccessClosedReasonCodeEnum.UserLeftOrganization
                await manager.getRepository(UserModelGrant).save(grant)
                await this.writeEvent(manager, {
                    tenantId: grant.tenantId,
                    organizationId: grant.organizationId ?? null,
                    requestId: grant.requestId,
                    grantId: grant.id,
                    eventType: ModelAccessEventTypeEnum.UserLeftOrganization,
                    actorType: ModelAccessActorTypeEnum.System,
                    fromStatus,
                    toStatus: grant.status,
                    reason: this.translate(
                        'server-ai:Error.ModelAccessUserLeftOrganizationReason',
                        'User left the organization.'
                    ),
                    systemReasonCode: ModelAccessClosedReasonCodeEnum.UserLeftOrganization,
                    idempotencyKey: `grant:${grant.id}:user-left-organization`,
                    modelSnapshot: grant.modelSnapshot
                })
            }
        })
    }

    async handleCopilotStateChanged(copilot: Pick<Copilot, 'id' | 'tenantId' | 'enabled'>): Promise<void> {
        const grants = await this.grantRepository.find({
            where: {
                tenantId: copilot.tenantId,
                copilotId: copilot.id,
                status: UserModelGrantStatusEnum.Active
            }
        })
        for (const grant of grants) {
            await this.reconcileGrantAvailability(grant)
        }
    }

    async handleConfiguredModelDeleted(input: {
        tenantId: string
        copilotId: string
        copilotModelId: string
        modelType: AiModelTypeEnum
    }): Promise<void> {
        const requests = await this.requestRepository.find({
            where: {
                tenantId: input.tenantId,
                copilotId: input.copilotId,
                copilotModelId: input.copilotModelId,
                modelType: input.modelType,
                status: ModelAccessRequestStatusEnum.Requested
            }
        })
        for (const request of requests) {
            await this.closeRequestForSystem(
                request,
                ModelAccessClosedReasonCodeEnum.ModelDeleted,
                ModelAccessEventTypeEnum.ModelDeleted
            )
        }

        const grants = await this.grantRepository.find({
            where: {
                tenantId: input.tenantId,
                copilotId: input.copilotId,
                copilotModelId: input.copilotModelId,
                modelType: input.modelType,
                status: UserModelGrantStatusEnum.Active
            }
        })
        for (const grant of grants) {
            await this.revokeGrantForDeletedModel(grant)
        }
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
            organizationModelsConfigured: boolean
            runtimeOrganizationId: string | null
        }
    ): Promise<IModelAccessCatalogItem> {
        const accessMode = this.resolveTargetAccessMode(
            target,
            features.runtimeOrganizationId,
            {
                tenantEnabled: features.tenantMembershipEnabled,
                organizationEnabled: features.organizationMembershipEnabled,
                organizationModelsConfigured: features.organizationModelsConfigured
            },
            this.userHasPermission(user, AIPermissionsEnum.MEMBERSHIP_EDIT) === true
        )
        const planIncluded =
            accessMode === ModelTargetAccessMode.Membership && this.isPlanIncluded(target, membershipAccess)
        const grant =
            grants.find(
                (item) => this.sameModelTarget(item, target) && item.status === UserModelGrantStatusEnum.Active
            ) ?? null
        const effectiveGrant = user.type === UserType.COMMUNICATION ? null : grant
        const pendingRequest =
            requests.find(
                (item) => this.sameModelTarget(item, target) && item.status === ModelAccessRequestStatusEnum.Requested
            ) ?? null
        const featureEnabled =
            target.ownershipScope === ModelAccessOwnershipScopeEnum.Tenant
                ? features.tenantFeatureEnabled
                : features.organizationFeatureEnabled
        const manager = this.canManageTargetScope(target)
        const quotaReason =
            accessMode === ModelTargetAccessMode.Membership ? await this.resolveQuotaReason(membershipAccess) : null
        const grantUnavailableReason = effectiveGrant
            ? accessMode === ModelTargetAccessMode.Blocked || !featureEnabled
                ? ModelAccessUnavailableReasonEnum.FeatureDisabled
                : !target.enabled
                  ? ModelAccessUnavailableReasonEnum.ModelDisabled
                  : quotaReason
            : null
        if (grant && !effectiveGrant) {
            await this.recordGrantAvailability(grant, ModelAccessUnavailableReasonEnum.TechnicalUser)
        } else if (effectiveGrant) {
            await this.recordGrantAvailability(effectiveGrant, grantUnavailableReason)
        }
        return {
            key: this.modelKey(target),
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

    private async loadVisibleCatalogTargets(organizationId: string | null): Promise<ModelTarget[]> {
        const tenantId = this.requireTenant()
        const catalogs = await Promise.all(
            Object.values(AiModelTypeEnum).map(async (modelType) => {
                const [available, management] = await Promise.all([
                    this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
                        new FindCopilotModelsQuery(modelType, CopilotModelCatalogMode.Available)
                    ),
                    this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
                        new FindCopilotModelsQuery(modelType, CopilotModelCatalogMode.Management)
                    )
                ])
                return { available, management }
            })
        )
        const targets = new Map<string, ModelTarget>()
        const addTargets = async (catalog: CopilotWithProviderDto[], listedForRequest: boolean) => {
            for (const copilot of catalog) {
                const copilotId = copilot.id
                const copilotOrganizationId = copilot.organizationId ?? null
                if (!copilotId || (copilotOrganizationId && copilotOrganizationId !== organizationId)) {
                    continue
                }
                for (const model of copilot.providerWithModels?.models ?? []) {
                    const target = await this.loadTarget(
                        {
                            tenantId,
                            copilotId,
                            copilotModelId: model.model,
                            modelType: model.model_type
                        },
                        organizationId
                    )
                    if (!target) {
                        continue
                    }
                    const key = this.modelKey(target)
                    targets.set(key, {
                        ...target,
                        listedForRequest: listedForRequest || targets.get(key)?.listedForRequest === true
                    })
                }
            }
        }
        for (const catalog of catalogs) {
            await addTargets(catalog.available, false)
            await addTargets(catalog.management, true)
        }
        return Array.from(targets.values())
    }

    private async loadTargets(
        inputs: Array<Pick<ResolveModelInput, 'tenantId' | 'copilotId' | 'copilotModelId' | 'modelType'>>,
        visibleOrganizationId: string | null
    ): Promise<Array<ModelTarget | null>> {
        if (!inputs.length) {
            return []
        }
        const tenantId = inputs[0].tenantId
        const copilots = await this.copilotRepository.find({
            where: {
                tenantId,
                id: In(Array.from(new Set(inputs.map((input) => input.copilotId))))
            },
            relations: ['modelProvider']
        })
        const copilotById = new Map(copilots.map((copilot) => [copilot.id, copilot]))
        const providerIds = Array.from(
            new Set(copilots.map((copilot) => copilot.modelProvider?.id).filter((id): id is string => !!id))
        )
        const customModels = providerIds.length
            ? await this.providerModelRepository.find({
                  where: {
                      tenantId,
                      providerId: In(providerIds),
                      modelType: In(Array.from(new Set(inputs.map((input) => input.modelType)))),
                      modelName: In(Array.from(new Set(inputs.map((input) => input.copilotModelId))))
                  }
              })
            : []
        const customByModel = new Map(
            customModels.map((model) => [`${model.providerId}:${model.modelType}:${model.modelName}`, model])
        )

        return inputs.map((input) => {
            const copilot = copilotById.get(input.copilotId)
            if (!copilot?.modelProvider?.providerName) {
                return null
            }
            const organizationId = copilot.organizationId ?? null
            const provider = this.providersService.getProvider(
                copilot.modelProvider.providerName,
                false,
                organizationId ?? undefined
            )
            const custom = customByModel.get(`${copilot.modelProvider.id}:${input.modelType}:${input.copilotModelId}`)
            return this.createModelTarget(input, copilot, provider, custom, visibleOrganizationId)
        })
    }

    private async loadTarget(
        input: Pick<ResolveModelInput, 'tenantId' | 'copilotId' | 'copilotModelId' | 'modelType'>,
        visibleOrganizationId?: string | null
    ): Promise<ModelTarget | null> {
        const copilot = await this.copilotRepository.findOne({
            where: {
                tenantId: input.tenantId,
                id: input.copilotId
            },
            relations: ['modelProvider']
        })
        if (!copilot?.modelProvider?.providerName) {
            return null
        }
        const organizationId = copilot.organizationId ?? null
        const provider = this.providersService.getProvider(
            copilot.modelProvider.providerName,
            false,
            organizationId ?? undefined
        )
        if (!provider) {
            return null
        }
        const custom = await this.providerModelRepository.findOne({
            where: {
                tenantId: input.tenantId,
                providerId: copilot.modelProvider.id,
                modelType: input.modelType,
                modelName: input.copilotModelId
            }
        })
        return this.createModelTarget(input, copilot, provider, custom, visibleOrganizationId ?? null)
    }

    private createModelTarget(
        input: Pick<ResolveModelInput, 'tenantId' | 'copilotId' | 'copilotModelId' | 'modelType'>,
        copilot: Copilot,
        provider: ReturnType<AIProvidersService['getProvider']>,
        custom: CopilotProviderModel | null | undefined,
        visibleOrganizationId: string | null
    ): ModelTarget | null {
        if (!provider || !copilot.modelProvider?.providerName) {
            return null
        }
        const organizationId = copilot.organizationId ?? null
        if (organizationId && organizationId !== visibleOrganizationId) {
            return null
        }
        const providerName = copilot.modelProvider.providerName
        const predefined = provider
            .getProviderModels(input.modelType)
            ?.find((model) => model.model === input.copilotModelId)
        const selectedMatches =
            copilot.copilotModel?.modelType === input.modelType && copilot.copilotModel?.model === input.copilotModelId
        if (!predefined && !custom && !selectedMatches) {
            return null
        }
        const providerSchema = provider.getProviderSchema()
        return {
            tenantId: input.tenantId,
            organizationId,
            ownershipScope: organizationId
                ? ModelAccessOwnershipScopeEnum.Organization
                : ModelAccessOwnershipScopeEnum.Tenant,
            copilotId: copilot.id,
            copilotModelId: input.copilotModelId,
            copilotName: copilot.name,
            provider: providerName,
            providerLabel: providerSchema?.label,
            modelType: input.modelType,
            model: input.copilotModelId,
            modelLabel: predefined?.label ?? {
                en_US: custom?.modelName ?? input.copilotModelId,
                zh_Hans: custom?.modelName ?? input.copilotModelId
            },
            capabilities: predefined?.features ?? this.customCapabilities(custom?.modelProperties),
            deprecated: predefined?.deprecated === true,
            enabled:
                copilot.enabled === true &&
                copilot.modelProvider.isValid !== false &&
                custom?.isValid !== false &&
                predefined?.deprecated !== true,
            usesOrganizationCredentials: usesOrganizationCredentials(copilot, organizationId)
        }
    }

    private customCapabilities(modelProperties?: Record<string, unknown> | null) {
        const features: ModelFeature[] = []
        if (modelProperties?.vision_support === 'support') {
            features.push(ModelFeature.VISION)
        }
        if (modelProperties?.function_calling_type === 'tool_call') {
            features.push(ModelFeature.TOOL_CALL)
        }
        return features
    }

    private async ensureAutomaticPublications(targets: ModelTarget[], manager?: EntityManager, attempt = 0) {
        if (!targets.length) {
            return []
        }
        const tenantId = targets[0].tenantId
        const repository = manager?.getRepository(ModelGatewayPublication) ?? this.publicationRepository
        const existing = await repository.find({ where: { tenantId } })
        const bySource = new Map(existing.map((publication) => [this.publicationSourceKey(publication), publication]))
        const usedExternalModelIds = new Set(existing.map((publication) => publication.externalModelId))
        const changed: ModelGatewayPublication[] = []
        const publications = targets.map((target) => {
            const sourceKey = this.publicationSourceKey(target)
            let publication = bySource.get(sourceKey)
            if (!publication) {
                publication = repository.create({
                    tenantId,
                    organizationId: target.organizationId,
                    copilotId: target.copilotId,
                    copilotModelId: target.copilotModelId,
                    provider: target.provider,
                    modelType: target.modelType,
                    model: target.model,
                    externalModelId: this.automaticExternalModelId(target, usedExternalModelIds),
                    capabilities: target.capabilities
                })
                bySource.set(sourceKey, publication)
                usedExternalModelIds.add(publication.externalModelId)
                changed.push(publication)
                return publication
            }

            const capabilitiesChanged =
                publication.capabilities.length !== target.capabilities.length ||
                publication.capabilities.some((capability, index) => capability !== target.capabilities[index])
            if (
                publication.provider !== target.provider ||
                publication.model !== target.model ||
                (publication.organizationId ?? null) !== target.organizationId ||
                capabilitiesChanged
            ) {
                publication.organizationId = target.organizationId
                publication.provider = target.provider
                publication.model = target.model
                publication.capabilities = target.capabilities
                changed.push(publication)
            }
            return publication
        })
        if (changed.length) {
            try {
                await repository.save(changed)
            } catch (error) {
                if (!manager && attempt < 2 && this.isUniqueViolation(error)) {
                    return this.ensureAutomaticPublications(targets, undefined, attempt + 1)
                }
                throw error
            }
        }
        return publications
    }

    private automaticExternalModelId(target: ModelTarget, used: Set<string>) {
        const provider = this.externalModelIdPart(target.provider)
        const model = this.externalModelIdPart(target.model)
        const candidates = [model, `${provider}/${model}`]
        for (const candidate of candidates) {
            if (candidate.length <= 191 && !used.has(candidate)) {
                return candidate
            }
        }
        const suffix = `-${createHash('sha256').update(this.publicationSourceKey(target)).digest('hex')}`
        return `${provider}/${model}`.slice(0, 191 - suffix.length) + suffix
    }

    private externalModelIdPart(value: string) {
        return value.replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '') || 'model'
    }

    private publicationSourceKey(
        source: Pick<ModelTarget | ModelGatewayPublication, 'copilotId' | 'modelType' | 'copilotModelId'>
    ) {
        return `${source.copilotId}:${source.modelType}:${source.copilotModelId}`
    }

    private async requireVisibleEnabledTarget(
        input: Pick<ResolveModelInput, 'tenantId' | 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>
    ) {
        const target = await this.loadTarget(input, input.organizationId)
        if (!target) {
            throw new NotFoundException(
                this.translate('server-ai:Error.ModelAccessModelNotFound', 'The requested model is not available.')
            )
        }
        if (!target.enabled) {
            throw new BadRequestException(
                this.translate('server-ai:Error.ModelAccessModelDisabled', 'The model is currently disabled.')
            )
        }
        return target
    }

    private async targetFromRequest(request: ModelAccessRequest) {
        return this.loadTarget(
            {
                tenantId: request.tenantId,
                copilotId: request.copilotId,
                copilotModelId: request.copilotModelId,
                modelType: request.modelType
            },
            request.organizationId ?? null
        )
    }

    private async findActiveGrant(
        target: ModelTarget,
        userId: string,
        manager?: EntityManager,
        channel = ModelAccessChannelEnum.Xpert
    ) {
        const repository = manager?.getRepository(UserModelGrant) ?? this.grantRepository
        const qb = repository
            .createQueryBuilder('grant')
            .where('grant.tenantId = :tenantId', { tenantId: target.tenantId })
            .andWhere('grant.channel = :channel', { channel })
            .andWhere('grant.userId = :userId', { userId })
            .andWhere('grant.copilotId = :copilotId', { copilotId: target.copilotId })
            .andWhere('grant.copilotModelId = :copilotModelId', { copilotModelId: target.copilotModelId })
            .andWhere('grant.modelType = :modelType', { modelType: target.modelType })
            .andWhere('grant.status = :status', { status: UserModelGrantStatusEnum.Active })
        this.applyScopeFilter(qb, 'grant.organizationId', target.organizationId)
        return qb.getOne()
    }

    private async findActiveGrantByInput(input: ResolveModelInput, userId: string) {
        const qb = this.grantRepository
            .createQueryBuilder('grant')
            .where('grant.tenantId = :tenantId', { tenantId: input.tenantId })
            .andWhere('grant.channel = :channel', { channel: ModelAccessChannelEnum.Xpert })
            .andWhere('grant.userId = :userId', { userId })
            .andWhere('grant.copilotId = :copilotId', { copilotId: input.copilotId })
            .andWhere('grant.copilotModelId = :copilotModelId', { copilotModelId: input.copilotModelId })
            .andWhere('grant.modelType = :modelType', { modelType: input.modelType })
            .andWhere('grant.status = :status', { status: UserModelGrantStatusEnum.Active })
        if (input.organizationId) {
            qb.andWhere('(grant.organizationId IS NULL OR grant.organizationId = :runtimeOrganizationId)', {
                runtimeOrganizationId: input.organizationId
            })
        } else {
            qb.andWhere('grant.organizationId IS NULL')
        }
        return qb.getOne()
    }

    private async findPendingRequest(target: ModelTarget, requesterId: string, channel = ModelAccessChannelEnum.Xpert) {
        const qb = this.requestRepository
            .createQueryBuilder('request')
            .where('request.tenantId = :tenantId', { tenantId: target.tenantId })
            .andWhere('request.channel = :channel', { channel })
            .andWhere('request.requesterId = :requesterId', { requesterId })
            .andWhere('request.copilotId = :copilotId', { copilotId: target.copilotId })
            .andWhere('request.copilotModelId = :copilotModelId', { copilotModelId: target.copilotModelId })
            .andWhere('request.modelType = :modelType', { modelType: target.modelType })
            .andWhere('request.status = :status', { status: ModelAccessRequestStatusEnum.Requested })
        this.applyScopeFilter(qb, 'request.organizationId', target.organizationId)
        return qb.getOne()
    }

    private async findUserRequestsForCurrentContext(
        tenantId: string,
        requesterId: string,
        organizationId: string | null,
        channel = ModelAccessChannelEnum.Xpert
    ) {
        const qb = this.requestRepository
            .createQueryBuilder('request')
            .where('request.tenantId = :tenantId', { tenantId })
            .andWhere('request.channel = :channel', { channel })
            .andWhere('request.requesterId = :requesterId', { requesterId })
            .andWhere(
                organizationId
                    ? '(request.organizationId IS NULL OR request.organizationId = :organizationId)'
                    : 'request.organizationId IS NULL',
                { organizationId }
            )
            .orderBy('request.createdAt', 'DESC')
        return qb.getMany()
    }

    private async findUserGrantsForCurrentContext(
        tenantId: string,
        userId: string,
        organizationId: string | null,
        channel = ModelAccessChannelEnum.Xpert
    ) {
        const qb = this.grantRepository
            .createQueryBuilder('grant')
            .where('grant.tenantId = :tenantId', { tenantId })
            .andWhere('grant.channel = :channel', { channel })
            .andWhere('grant.userId = :userId', { userId })
            .andWhere(
                organizationId
                    ? '(grant.organizationId IS NULL OR grant.organizationId = :organizationId)'
                    : 'grant.organizationId IS NULL',
                { organizationId }
            )
            .orderBy('grant.createdAt', 'DESC')
        return qb.getMany()
    }

    private isPlanIncluded(target: ModelTarget, access: MembershipModelAccess | null) {
        if (!access) {
            return false
        }
        const scopeMatches =
            access.organizationId === target.organizationId ||
            (target.organizationId === null && !!access.organizationId && !!access.membership.plan.catalogSourcePlanId)
        return (
            scopeMatches && this.membershipService.isModelAllowed(access.membership.plan, target.provider, target.model)
        )
    }

    async hasConfiguredOrganizationModels(tenantId: string, organizationId: string): Promise<boolean> {
        const copilots = await this.copilotRepository.find({
            where: {
                tenantId,
                organizationId,
                enabled: true
            },
            relations: ['modelProvider']
        })

        for (const copilot of copilots) {
            const modelProvider = copilot.modelProvider
            if (!modelProvider?.id || !modelProvider.providerName || modelProvider.isValid === false) {
                continue
            }

            const provider = this.providersService.getProvider(modelProvider.providerName, false, organizationId)
            if (!provider) {
                continue
            }

            if (provider.getProviderModels()?.some((model) => !!model.model && model.deprecated !== true)) {
                return true
            }
            if (copilot.copilotModel?.model) {
                return true
            }

            const customModels = await this.providerModelRepository.find({
                where: {
                    tenantId,
                    providerId: modelProvider.id
                }
            })
            if (customModels.some((model) => !!model.modelName && model.isValid !== false)) {
                return true
            }
        }

        return false
    }

    private async resolveMembershipFeatureState(
        tenantId: string,
        runtimeOrganizationId: string | null
    ): Promise<MembershipFeatureState> {
        const [tenantEnabled, organizationEnabled, organizationModelsConfigured] = await Promise.all([
            this.membershipService.isMembershipPlanEnabled({ tenantId, organizationId: null }),
            runtimeOrganizationId
                ? this.membershipService.isMembershipPlanEnabled({
                      tenantId,
                      organizationId: runtimeOrganizationId
                  })
                : Promise.resolve(false),
            runtimeOrganizationId
                ? this.hasConfiguredOrganizationModels(tenantId, runtimeOrganizationId)
                : Promise.resolve(false)
        ])
        return {
            tenantEnabled,
            organizationEnabled,
            organizationModelsConfigured
        }
    }

    private resolveTargetAccessMode(
        target: ModelTarget,
        runtimeOrganizationId: string | null,
        membershipFeatures: MembershipFeatureState,
        canManageMembership: boolean
    ): ModelTargetAccessMode {
        if (target.organizationId) {
            if (!membershipFeatures.organizationEnabled) {
                return ModelTargetAccessMode.Direct
            }
            return target.usesOrganizationCredentials && !canManageMembership
                ? ModelTargetAccessMode.Direct
                : ModelTargetAccessMode.Membership
        }
        if (!runtimeOrganizationId) {
            return membershipFeatures.tenantEnabled ? ModelTargetAccessMode.Membership : ModelTargetAccessMode.Direct
        }
        if (membershipFeatures.organizationModelsConfigured) {
            return ModelTargetAccessMode.Blocked
        }
        return membershipFeatures.organizationEnabled || membershipFeatures.tenantEnabled
            ? ModelTargetAccessMode.Membership
            : ModelTargetAccessMode.Blocked
    }

    private async resolveQuotaReason(access: MembershipModelAccess | null) {
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

    private async assertModelGatewayFeatureEnabled(
        scope: string | { tenantId: string; organizationId: string | null },
        manager?: EntityManager
    ) {
        if (await this.isModelGatewayFeatureEnabled(scope, manager)) {
            return
        }
        throw new ForbiddenException(
            this.translate('server-ai:Error.ModelGatewayFeatureDisabled', 'External model API access is disabled.')
        )
    }

    private async assertAdminChannelFeatureEnabled(channel?: ModelAccessChannelEnum, manager?: EntityManager) {
        if (channel === ModelAccessChannelEnum.ExternalApi) {
            return this.assertModelGatewayFeatureEnabled(this.currentScope(), manager)
        }
        if (channel === ModelAccessChannelEnum.Xpert) {
            return this.assertCurrentAdminFeatureEnabled(manager)
        }
        const scope = this.currentScope()
        if (
            (await this.isModelAccessFeatureEnabled(scope, manager)) ||
            (await this.isModelGatewayFeatureEnabled(scope, manager))
        ) {
            return
        }
        throw new ForbiddenException(
            this.translate('server-ai:Error.ModelAccessFeatureDisabled', 'Personal model access is disabled.')
        )
    }

    private async assertExternalGatewayEligibility(
        scope: { tenantId: string; organizationId: string | null },
        user: IUser,
        manager?: EntityManager
    ) {
        await this.assertModelGatewayFeatureEnabled(scope, manager)
        if (
            user.type === UserType.COMMUNICATION ||
            !this.userHasPermission(user, AIPermissionsEnum.MODEL_GATEWAY_USE)
        ) {
            throw new ForbiddenException(
                this.translate(
                    'server-ai:Error.ModelGatewayPermissionRequired',
                    'Your role is not allowed to use the external model API.'
                )
            )
        }
    }

    private userHasPermission(user: IUser, permission: AIPermissionsEnum) {
        return user.role?.rolePermissions?.some(
            (rolePermission) => rolePermission.enabled && rolePermission.permission === permission
        )
    }

    private async hasUserPermission(tenantId: string, userId: string, permission: AIPermissionsEnum) {
        const user = await this.userRepository.findOne({
            where: { tenantId, id: userId },
            relations: ['role', 'role.rolePermissions']
        })
        return !!user && this.userHasPermission(user, permission) === true
    }

    private async isModelAccessFeatureEnabled(
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
        this.applyScopeFilter(qb, 'featureOrganization.organizationId', organizationId)
        return qb.getOne()
    }

    private async assertRequestFeatureEnabled(target: ModelTarget, manager?: EntityManager) {
        if (
            await this.isModelAccessFeatureEnabled(
                { tenantId: target.tenantId, organizationId: target.organizationId },
                manager
            )
        ) {
            return
        }
        throw new ForbiddenException(
            this.translate('server-ai:Error.ModelAccessFeatureDisabled', 'Personal model access is disabled.')
        )
    }

    private async assertCurrentAdminFeatureEnabled(manager?: EntityManager) {
        const scope = this.currentScope()
        if (await this.isModelAccessFeatureEnabled(scope, manager)) {
            return
        }
        throw new ForbiddenException(
            this.translate('server-ai:Error.ModelAccessFeatureDisabled', 'Personal model access is disabled.')
        )
    }

    private assertRequesterIsNotManager(target: ModelTarget) {
        if (this.canManageTargetScope(target)) {
            throw new ForbiddenException(
                this.translate(
                    'server-ai:Error.ModelAccessManagerCannotRequest',
                    'Users who manage this scope cannot request personal model access.'
                )
            )
        }
    }

    private canManageTargetScope(target: {
        ownershipScope: ModelAccessOwnershipScopeEnum
        organizationId?: string | null
    }) {
        const targetMatchesCurrentScope =
            target.ownershipScope === ModelAccessOwnershipScopeEnum.Tenant
                ? RequestContext.isTenantScope()
                : RequestContext.isOrganizationScope() &&
                  RequestContext.getOrganizationId() === (target.organizationId ?? null)
        if (!targetMatchesCurrentScope) {
            return false
        }
        return [
            AIPermissionsEnum.COPILOT_EDIT,
            AIPermissionsEnum.MEMBERSHIP_EDIT,
            AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
        ].some((permission) => RequestContext.hasPermission(permission, false))
    }

    private async reconcilePendingRequest(request: ModelAccessRequest) {
        const target = await this.targetFromRequest(request)
        if (!target) {
            await this.closeRequestForSystem(
                request,
                ModelAccessClosedReasonCodeEnum.ModelDeleted,
                ModelAccessEventTypeEnum.ModelDeleted
            )
            return true
        }
        if (request.channel === ModelAccessChannelEnum.ExternalApi) {
            return false
        }
        const access = await this.membershipService.findModelAccess({
            tenantId: request.tenantId,
            organizationId: request.requestedFromOrganizationId,
            userId: request.requesterId
        })
        if (this.isPlanIncluded(target, access)) {
            await this.closeRequestForSystem(
                request,
                ModelAccessClosedReasonCodeEnum.PlanIncluded,
                ModelAccessEventTypeEnum.SystemClosed
            )
            return true
        }
        return false
    }

    private async closeRequestForSystem(
        request: ModelAccessRequest,
        reasonCode: ModelAccessClosedReasonCodeEnum,
        eventType: ModelAccessEventTypeEnum,
        manager?: EntityManager
    ) {
        const run = async (transactionManager: EntityManager) => {
            const repository = transactionManager.getRepository(ModelAccessRequest)
            const current =
                manager === transactionManager
                    ? request
                    : await this.findRequestForUpdate(transactionManager, request.id, request.tenantId)
            if (current.status !== ModelAccessRequestStatusEnum.Requested) {
                return current
            }
            const fromStatus = current.status
            current.status = ModelAccessRequestStatusEnum.Closed
            current.closedReasonCode = reasonCode
            current.decidedAt = new Date()
            current.decisionReason = reasonCode
            const saved = await repository.save(current)
            await this.writeEvent(transactionManager, {
                tenantId: current.tenantId,
                organizationId: current.organizationId ?? null,
                requestId: current.id,
                eventType,
                actorType: ModelAccessActorTypeEnum.System,
                fromStatus,
                toStatus: current.status,
                reason: reasonCode,
                systemReasonCode: reasonCode,
                idempotencyKey: `request:${current.id}:closed:${reasonCode}`,
                modelSnapshot: current.modelSnapshot
            })
            return saved
        }
        return manager ? run(manager) : this.dataSource.transaction(run)
    }

    private async reconcileGrantAvailability(grant: UserModelGrant) {
        const target = await this.loadTarget(
            {
                tenantId: grant.tenantId,
                copilotId: grant.copilotId,
                copilotModelId: grant.copilotModelId,
                modelType: grant.modelType
            },
            grant.organizationId ?? null
        )
        if (!target) {
            await this.revokeGrantForDeletedModel(grant)
            return true
        }
        const featureEnabled =
            grant.channel === ModelAccessChannelEnum.ExternalApi
                ? await this.isModelGatewayFeatureEnabled({
                      tenantId: grant.tenantId,
                      organizationId: grant.organizationId ?? null
                  })
                : await this.isModelAccessFeatureEnabled({
                      tenantId: grant.tenantId,
                      organizationId: grant.organizationId ?? null
                  })
        const unavailableReason = (await this.isTechnicalUser(grant.tenantId, grant.userId))
            ? ModelAccessUnavailableReasonEnum.TechnicalUser
            : !featureEnabled
              ? ModelAccessUnavailableReasonEnum.FeatureDisabled
              : target.enabled
                ? null
                : ModelAccessUnavailableReasonEnum.ModelDisabled
        const changed = (grant.lastUnavailableReason ?? null) !== unavailableReason
        await this.recordGrantAvailability(grant, unavailableReason)
        return changed
    }

    private async isTechnicalUser(tenantId: string, userId: string, manager?: EntityManager) {
        const repository = manager?.getRepository(User) ?? this.userRepository
        const user = await repository.findOne({
            where: { tenantId, id: userId },
            select: { id: true, type: true }
        })
        return user?.type === UserType.COMMUNICATION
    }

    private async revokeGrantForDeletedModel(grant: UserModelGrant) {
        if (grant.status !== UserModelGrantStatusEnum.Active) {
            return
        }
        await this.dataSource.transaction(async (manager) => {
            const current = await manager
                .getRepository(UserModelGrant)
                .createQueryBuilder('grant')
                .setLock('pessimistic_write')
                .where('grant.id = :id', { id: grant.id })
                .getOne()
            if (!current || current.status !== UserModelGrantStatusEnum.Active) {
                return
            }
            const fromStatus = current.status
            current.status = UserModelGrantStatusEnum.Revoked
            current.revokedAt = new Date()
            current.revokeReason = ModelAccessClosedReasonCodeEnum.ModelDeleted
            current.lastUnavailableReason = ModelAccessUnavailableReasonEnum.ModelDeleted
            await manager.getRepository(UserModelGrant).save(current)
            await this.writeEvent(manager, {
                tenantId: current.tenantId,
                organizationId: current.organizationId ?? null,
                requestId: current.requestId,
                grantId: current.id,
                eventType: ModelAccessEventTypeEnum.ModelDeleted,
                actorType: ModelAccessActorTypeEnum.System,
                fromStatus,
                toStatus: current.status,
                reason: ModelAccessClosedReasonCodeEnum.ModelDeleted,
                systemReasonCode: ModelAccessClosedReasonCodeEnum.ModelDeleted,
                idempotencyKey: `grant:${current.id}:model-deleted`,
                modelSnapshot: current.modelSnapshot
            })
        })
    }

    private async recordGrantAvailability(
        grant: UserModelGrant,
        unavailableReason: ModelAccessUnavailableReasonEnum | null
    ) {
        const stateReason =
            unavailableReason === ModelAccessUnavailableReasonEnum.QuotaExhausted ||
            unavailableReason === ModelAccessUnavailableReasonEnum.MembershipRequired
                ? null
                : unavailableReason
        if ((grant.lastUnavailableReason ?? null) === stateReason) {
            return
        }
        await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(UserModelGrant)
            const current = await repository
                .createQueryBuilder('grant')
                .setLock('pessimistic_write')
                .where('grant.id = :id', { id: grant.id })
                .getOne()
            if (!current || current.status !== UserModelGrantStatusEnum.Active) {
                return
            }
            const previousReason = current.lastUnavailableReason ?? null
            if (previousReason === stateReason) {
                return
            }
            current.lastUnavailableReason = stateReason
            await repository.save(current)
            const restored = previousReason !== null && stateReason === null
            await this.writeEvent(manager, {
                tenantId: current.tenantId,
                organizationId: current.organizationId ?? null,
                requestId: current.requestId,
                grantId: current.id,
                eventType: restored ? ModelAccessEventTypeEnum.ModelRestored : ModelAccessEventTypeEnum.ModelSuspended,
                actorType: ModelAccessActorTypeEnum.System,
                fromStatus: previousReason ?? 'available',
                toStatus: stateReason ?? 'available',
                reason: stateReason,
                idempotencyKey: `grant:${current.id}:availability:${stateReason ?? 'available'}:${Date.now()}`,
                modelSnapshot: current.modelSnapshot
            })
        })
    }

    private async expireDueGrantsForModel(manager: EntityManager, target: ModelTarget, userId: string) {
        const grants = await manager
            .getRepository(UserModelGrant)
            .createQueryBuilder('grant')
            .setLock('pessimistic_write')
            .where('grant.tenantId = :tenantId', { tenantId: target.tenantId })
            .andWhere('grant.userId = :userId', { userId })
            .andWhere('grant.copilotId = :copilotId', { copilotId: target.copilotId })
            .andWhere('grant.copilotModelId = :copilotModelId', { copilotModelId: target.copilotModelId })
            .andWhere('grant.modelType = :modelType', { modelType: target.modelType })
            .andWhere('grant.status = :status', { status: UserModelGrantStatusEnum.Active })
            .andWhere('grant.validUntil IS NOT NULL')
            .andWhere('grant.validUntil < :now', { now: new Date() })
            .getMany()
        for (const grant of grants) {
            grant.status = UserModelGrantStatusEnum.Expired
            await manager.getRepository(UserModelGrant).save(grant)
            await this.writeEvent(manager, {
                tenantId: grant.tenantId,
                organizationId: grant.organizationId ?? null,
                requestId: grant.requestId,
                grantId: grant.id,
                eventType: ModelAccessEventTypeEnum.GrantExpired,
                actorType: ModelAccessActorTypeEnum.System,
                fromStatus: UserModelGrantStatusEnum.Active,
                toStatus: UserModelGrantStatusEnum.Expired,
                reason: this.translate('server-ai:Error.ModelAccessGrantExpiredReason', 'Grant validity period ended.'),
                idempotencyKey: `grant:${grant.id}:expired`,
                modelSnapshot: grant.modelSnapshot
            })
        }
    }

    private async findRequestForUpdate(manager: EntityManager, id: string, tenantId: string) {
        const request = await manager
            .getRepository(ModelAccessRequest)
            .createQueryBuilder('request')
            .setLock('pessimistic_write')
            .where('request.id = :id', { id })
            .andWhere('request.tenantId = :tenantId', { tenantId })
            .getOne()
        if (!request) {
            throw new NotFoundException(
                this.translate('server-ai:Error.ModelAccessRequestNotFound', 'Model access request not found.')
            )
        }
        return request
    }

    private async findRequestForAdminUpdate(manager: EntityManager, id: string) {
        const scope = this.currentScope()
        const qb = manager
            .getRepository(ModelAccessRequest)
            .createQueryBuilder('request')
            .setLock('pessimistic_write')
            .where('request.id = :id', { id })
            .andWhere('request.tenantId = :tenantId', { tenantId: scope.tenantId })
        this.applyScopeFilter(qb, 'request.organizationId', scope.organizationId)
        const request = await qb.getOne()
        if (!request) {
            throw new NotFoundException(
                this.translate('server-ai:Error.ModelAccessRequestNotFound', 'Model access request not found.')
            )
        }
        return request
    }

    private async findGrantForAdminUpdate(manager: EntityManager, id: string) {
        const scope = this.currentScope()
        const qb = manager
            .getRepository(UserModelGrant)
            .createQueryBuilder('grant')
            .setLock('pessimistic_write')
            .where('grant.id = :id', { id })
            .andWhere('grant.tenantId = :tenantId', { tenantId: scope.tenantId })
        this.applyScopeFilter(qb, 'grant.organizationId', scope.organizationId)
        const grant = await qb.getOne()
        if (!grant) {
            throw new NotFoundException(
                this.translate('server-ai:Error.ModelAccessGrantNotFound', 'Model grant not found.')
            )
        }
        return grant
    }

    private async attachEventsToRequest(request: ModelAccessRequest, manager?: EntityManager) {
        const repository = manager?.getRepository(ModelAccessEvent) ?? this.eventRepository
        const events = await repository.find({
            where: { tenantId: request.tenantId, requestId: request.id },
            order: { createdAt: 'ASC' }
        })
        return { ...request, events }
    }

    private async attachEventsToGrant(grant: UserModelGrant, manager?: EntityManager) {
        const repository = manager?.getRepository(ModelAccessEvent) ?? this.eventRepository
        const events = await repository.find({
            where: { tenantId: grant.tenantId, grantId: grant.id },
            order: { createdAt: 'ASC' }
        })
        return { ...grant, events }
    }

    private async writeEvent(manager: EntityManager, input: EventInput) {
        const actor = input.actor
        const request = input.requestId
            ? await manager.getRepository(ModelAccessRequest).findOne({
                  where: { tenantId: input.tenantId, id: input.requestId },
                  select: { id: true, requestedFromOrganizationId: true, channel: true }
              })
            : null
        const metadata = {
            ...(input.metadata ?? {}),
            actorPermissions:
                actor?.role?.rolePermissions
                    ?.filter((permission) => permission.enabled)
                    .map((permission) => permission.permission) ?? []
        }
        const event = manager.getRepository(ModelAccessEvent).create({
            tenantId: input.tenantId,
            channel: input.channel ?? request?.channel ?? ModelAccessChannelEnum.Xpert,
            organizationId: input.organizationId,
            requestedFromOrganizationId: request?.requestedFromOrganizationId ?? null,
            requestId: input.requestId,
            grantId: input.grantId,
            eventType: input.eventType,
            actorId: actor?.id ?? null,
            actorName: actor ? this.userName(actor) : 'System',
            actorType: input.actorType ?? (actor ? ModelAccessActorTypeEnum.User : ModelAccessActorTypeEnum.System),
            actorScope: actor
                ? RequestContext.isOrganizationScope()
                    ? ModelAccessOwnershipScopeEnum.Organization
                    : ModelAccessOwnershipScopeEnum.Tenant
                : input.organizationId
                  ? ModelAccessOwnershipScopeEnum.Organization
                  : ModelAccessOwnershipScopeEnum.Tenant,
            fromStatus: input.fromStatus,
            toStatus: input.toStatus,
            reason: input.reason,
            systemReasonCode: input.systemReasonCode,
            metadata,
            idempotencyKey: input.idempotencyKey,
            modelSnapshot: input.modelSnapshot
        })
        try {
            return await manager.getRepository(ModelAccessEvent).save(event)
        } catch (error) {
            if (!this.isUniqueViolation(error)) {
                throw error
            }
            return manager.getRepository(ModelAccessEvent).findOne({
                where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey }
            })
        }
    }

    private applyAdminFilters(
        qb: {
            andWhere: (where: string | Brackets, parameters?: Record<string, unknown>) => unknown
        },
        alias: 'request' | 'grant',
        query: IModelAccessAdminQuery,
        expiresBefore?: Date
    ) {
        if (query.search?.trim()) {
            qb.andWhere(
                new Brackets((searchQb) => {
                    searchQb
                        .where(`LOWER(${alias}.${alias === 'request' ? 'requesterName' : 'userName'}) LIKE :search`)
                        .orWhere(`LOWER(${alias}.provider) LIKE :search`)
                        .orWhere(`LOWER(${alias}.model) LIKE :search`)
                }),
                { search: `%${query.search.trim().toLowerCase()}%` }
            )
        }
        if (query.channel) {
            qb.andWhere(`${alias}.channel = :channel`, { channel: query.channel })
        }
        if (query.modelType) {
            qb.andWhere(`${alias}.modelType = :modelType`, { modelType: query.modelType })
        }
        if (query.status) {
            qb.andWhere(`${alias}.status = :status`, { status: query.status })
        }
        if (alias === 'grant' && expiresBefore) {
            qb.andWhere('grant.validUntil IS NOT NULL')
            qb.andWhere('grant.validUntil <= :expiresBefore', { expiresBefore })
        }
    }

    private applyScopeFilter<T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }>(
        qb: T,
        field: string,
        organizationId: string | null
    ) {
        return organizationId
            ? qb.andWhere(`${field} = :scopeOrganizationId`, { scopeOrganizationId: organizationId })
            : qb.andWhere(`${field} IS NULL`)
    }

    private sameModelTarget(
        item: Pick<
            ModelAccessRequest | UserModelGrant,
            'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'
        >,
        target: Pick<ModelTarget, 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>
    ) {
        return (
            (item.organizationId ?? null) === target.organizationId &&
            item.copilotId === target.copilotId &&
            item.copilotModelId === target.copilotModelId &&
            item.modelType === target.modelType
        )
    }

    private modelKey(target: Pick<ModelTarget, 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>) {
        return `${target.organizationId ?? 'tenant'}:${target.copilotId}:${target.modelType}:${target.copilotModelId}`
    }

    private snapshot(target: ModelTarget): IModelAccessModelSnapshot {
        return {
            copilotId: target.copilotId,
            copilotName: target.copilotName,
            copilotOrganizationId: target.organizationId,
            provider: target.provider,
            providerLabel: target.providerLabel,
            modelType: target.modelType,
            model: target.model,
            modelLabel: target.modelLabel,
            capturedAt: new Date()
        }
    }

    private assertRequestStatus(request: ModelAccessRequest, expected: ModelAccessRequestStatusEnum) {
        if (request.status !== expected) {
            throw new BadRequestException(
                this.translate(
                    'server-ai:Error.ModelAccessInvalidRequestStatus',
                    `The request must be ${expected} for this action.`
                )
            )
        }
    }

    private async requireNormalUser(tenantId: string, userId: string, throwForTechnical = true) {
        const user =
            RequestContext.currentUser()?.id === userId
                ? RequestContext.currentUser()
                : await this.userRepository.findOne({
                      where: { tenantId, id: userId },
                      relations: ['role', 'role.rolePermissions']
                  })
        if (!user) {
            throw new NotFoundException(this.translate('server-ai:Error.ModelAccessUserNotFound', 'User not found.'))
        }
        if (user.type === UserType.COMMUNICATION && throwForTechnical) {
            throw new ForbiddenException(
                this.translate(
                    'server-ai:Error.ModelAccessTechnicalUserForbidden',
                    'Technical users cannot request or receive personal model access.'
                )
            )
        }
        return user
    }

    private requireActor() {
        const actor = RequestContext.currentUser()
        if (!actor?.id) {
            throw new ForbiddenException(
                this.translate(
                    'server-ai:Error.ModelAccessAuthenticatedUserRequired',
                    'Authenticated user is required.'
                )
            )
        }
        return actor
    }

    private requireTenant() {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            throw new ForbiddenException(
                this.translate('server-ai:Error.ModelAccessTenantContextRequired', 'Tenant context is required.')
            )
        }
        return tenantId
    }

    private requireUser() {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new ForbiddenException(
                this.translate(
                    'server-ai:Error.ModelAccessAuthenticatedUserRequired',
                    'Authenticated user is required.'
                )
            )
        }
        return userId
    }

    private currentScope() {
        return {
            tenantId: this.requireTenant(),
            organizationId: RequestContext.getOrganizationId()
        }
    }

    private userName(user: IUser) {
        return (
            user.fullName?.trim() ||
            user.name?.trim() ||
            [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
            user.email?.trim() ||
            user.username?.trim() ||
            user.id
        )
    }

    private requireText(value: string | null | undefined, key: string, fallback: string) {
        const text = value?.trim()
        if (!text) {
            throw new BadRequestException(this.translate(key, fallback))
        }
        return text
    }

    private optionalText(value?: string | null) {
        return value?.trim() || null
    }

    private async normalizeValidUntil(value: string | null | undefined, manager?: EntityManager) {
        if (!value) {
            return null
        }
        const dateOnly = DATE_ONLY_PATTERN.test(value)
        const validUntil = dateOnly
            ? modelAccessEndOfDay(value, await this.resolveTenantTimeZone(this.requireTenant(), manager))
            : new Date(value)
        if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
            throw new BadRequestException(
                this.translate(
                    'server-ai:Error.ModelAccessInvalidExpiration',
                    'The grant expiration must be in the future.'
                )
            )
        }
        return validUntil
    }

    private async normalizeAdminExpiresBefore(value: string, tenantId: string) {
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

    private pageSize(value?: number) {
        return Math.min(Math.max(Number(value ?? 50), 1), MAX_PAGE_SIZE)
    }

    private pageOffset(value?: number) {
        return Math.max(Number(value ?? 0), 0)
    }

    private isUniqueViolation(error: unknown) {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string' &&
            error.code === '23505'
        )
    }

    private translate(key: string, fallback: string) {
        const message = t(key, { defaultValue: fallback })
        return typeof message === 'string' && message !== key ? message : fallback
    }
}
