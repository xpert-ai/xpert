import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    IModelAccessAdminQuery,
    IModelAccessRequest,
    IUserModelGrant,
    ModelAccessChannelEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessRequestStatusEnum,
    TModelAccessRequestApproveInput,
    TModelAccessRequestCreateInput,
    TModelAccessRequestRejectInput,
    TModelAccessRequestWithdrawInput,
    TUserModelGrantExtendInput,
    TUserModelGrantRevokeInput,
    UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Brackets, DataSource, Repository } from 'typeorm'
import { MembershipService } from '../../membership/membership.service'
import { ModelAccessEvent } from '../model-access-event.entity'
import { ModelAccessRequest } from '../model-access-request.entity'
import { snapshotModelTarget } from '../model-access.utils'
import { UserModelGrant } from '../user-model-grant.entity'

import { ModelAccessLifecycleService } from '../lifecycle/model-access-lifecycle.service'
import { ModelAccessPolicyService } from '../policy/model-access-policy.service'
import { ModelAccessRecordsService } from './model-access-records.service'
import { ModelAccessTargetsService } from '../catalog/model-access-targets.service'
import {
    applyAdminFilters,
    applyScopeFilter,
    assertRequestStatus,
    assertRequesterIsNotManager,
    currentScope,
    isUniqueViolation,
    optionalText,
    pageOffset,
    pageSize,
    requireActor,
    requireTenant,
    requireText,
    requireUser,
    translate,
    userName
} from '../model-access.utils'

@Injectable()
export class ModelAccessRequestsService {
    constructor(
        private readonly membershipService: MembershipService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(ModelAccessRequest)
        private readonly requestRepository: Repository<ModelAccessRequest>,
        @InjectRepository(UserModelGrant)
        private readonly grantRepository: Repository<UserModelGrant>,
        @InjectRepository(ModelAccessEvent)
        private readonly eventRepository: Repository<ModelAccessEvent>,
        private readonly policy: ModelAccessPolicyService,
        private readonly targets: ModelAccessTargetsService,
        private readonly lifecycle: ModelAccessLifecycleService,
        private readonly records: ModelAccessRecordsService
    ) {}

    async createRequest(input: TModelAccessRequestCreateInput): Promise<IModelAccessRequest> {
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
        await this.policy.assertRequestFeatureEnabled(target)
        assertRequesterIsNotManager(target)

        const reason = requireText(
            input.reason,
            'server-ai:Error.ModelAccessRequestReasonRequired',
            'Request reason is required.'
        )
        const membershipAccess = await this.membershipService.findModelAccess({
            tenantId,
            organizationId: requestedFromOrganizationId,
            userId: requesterId
        })
        if (this.policy.isPlanIncluded(target, membershipAccess)) {
            throw new BadRequestException(
                translate('server-ai:Error.ModelAccessPlanIncluded', 'The membership plan already includes this model.')
            )
        }

        await this.lifecycle.processDueGrants({
            tenantId,
            userId: requesterId,
            copilotId: target.copilotId,
            copilotModelId: target.copilotModelId,
            modelType: target.modelType
        })
        const activeGrant = await this.records.findActiveGrant(target, requesterId)
        if (activeGrant) {
            throw new BadRequestException(
                translate('server-ai:Error.ModelAccessAlreadyGranted', 'This model is already granted.')
            )
        }

        const existing = await this.records.findPendingRequest(target, requesterId)
        if (existing) {
            return this.records.attachEventsToRequest(existing)
        }

        const snapshot = snapshotModelTarget(target)
        try {
            return await this.dataSource.transaction(async (manager) => {
                const request = manager.getRepository(ModelAccessRequest).create({
                    tenantId,
                    channel: ModelAccessChannelEnum.Xpert,
                    organizationId: target.organizationId,
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
                    modelSnapshot: snapshot
                })
                const saved = await manager.getRepository(ModelAccessRequest).save(request)
                await this.records.writeEvent(manager, {
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
                return this.records.attachEventsToRequest(saved, manager)
            })
        } catch (error) {
            if (isUniqueViolation(error)) {
                const duplicate = await this.records.findPendingRequest(target, requesterId)
                if (duplicate) {
                    return this.records.attachEventsToRequest(duplicate)
                }
            }
            throw error
        }
    }

    async findMyRequests(channel = ModelAccessChannelEnum.Xpert): Promise<IModelAccessRequest[]> {
        const tenantId = requireTenant()
        const userId = requireUser()
        await this.policy.requireNormalUser(tenantId, userId, false)
        const organizationId = RequestContext.getOrganizationId()
        const requests = await this.records.findUserRequestsForCurrentContext(tenantId, userId, organizationId, channel)
        for (const request of requests.filter((item) => item.status === ModelAccessRequestStatusEnum.Requested)) {
            await this.lifecycle.reconcilePendingRequest(request)
        }
        const refreshed = await this.records.findUserRequestsForCurrentContext(
            tenantId,
            userId,
            organizationId,
            channel
        )
        return Promise.all(refreshed.map((request) => this.records.attachEventsToRequest(request)))
    }

    async withdrawRequest(
        id: string,
        input?: TModelAccessRequestWithdrawInput,
        channel = ModelAccessChannelEnum.Xpert
    ): Promise<IModelAccessRequest> {
        const tenantId = requireTenant()
        const requesterId = requireUser()
        const actor = await this.policy.requireNormalUser(tenantId, requesterId)
        const reason = optionalText(input?.reason)

        return this.dataSource.transaction(async (manager) => {
            const request = await this.records.findRequestForUpdate(manager, id, tenantId)
            if ((request.channel ?? ModelAccessChannelEnum.Xpert) !== channel) {
                throw new NotFoundException(
                    translate('server-ai:Error.ModelAccessRequestNotFound', 'Model access request not found.')
                )
            }
            if (request.requesterId !== requesterId) {
                throw new ForbiddenException(
                    translate('server-ai:Error.ModelAccessWithdrawForbidden', 'You cannot withdraw this request.')
                )
            }
            if (request.status === ModelAccessRequestStatusEnum.Withdrawn) {
                return this.records.attachEventsToRequest(request, manager)
            }
            assertRequestStatus(request, ModelAccessRequestStatusEnum.Requested)
            const fromStatus = request.status
            request.status = ModelAccessRequestStatusEnum.Withdrawn
            request.decidedAt = new Date()
            request.decisionReason = reason
            const saved = await manager.getRepository(ModelAccessRequest).save(request)
            await this.records.writeEvent(manager, {
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
            return this.records.attachEventsToRequest(saved, manager)
        })
    }

    async findMyGrants(channel = ModelAccessChannelEnum.Xpert): Promise<IUserModelGrant[]> {
        const tenantId = requireTenant()
        const userId = requireUser()
        await this.policy.requireNormalUser(tenantId, userId, false)
        await this.lifecycle.processDueGrants({ tenantId, userId })
        const organizationId = RequestContext.getOrganizationId()
        const grants = await this.records.findUserGrantsForCurrentContext(tenantId, userId, organizationId, channel)
        for (const grant of grants.filter((item) => item.status === UserModelGrantStatusEnum.Active)) {
            await this.lifecycle.reconcileGrantAvailability(grant)
        }
        const refreshed = await this.records.findUserGrantsForCurrentContext(tenantId, userId, organizationId, channel)
        return Promise.all(refreshed.map((grant) => this.records.attachEventsToGrant(grant)))
    }

    async findAdminRequests(query: IModelAccessAdminQuery = {}) {
        await this.policy.assertAdminChannelFeatureEnabled(query.channel)
        const scope = currentScope()
        const take = pageSize(query.take)
        const skip = pageOffset(query.skip)
        const qb = this.requestRepository
            .createQueryBuilder('request')
            .where('request.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('request.createdAt', 'DESC')
            .take(take)
            .skip(skip)
        applyScopeFilter(qb, 'request.organizationId', scope.organizationId)
        applyAdminFilters(qb, 'request', query)
        let [items, total] = await qb.getManyAndCount()
        const pendingRequests = items.filter((item) => item.status === ModelAccessRequestStatusEnum.Requested)
        for (const request of pendingRequests) {
            await this.lifecycle.reconcilePendingRequest(request)
        }
        if (pendingRequests.length) {
            const refreshed = await qb.getManyAndCount()
            items = refreshed[0]
            total = refreshed[1]
        }
        return {
            items: await Promise.all(items.map((request) => this.records.attachEventsToRequest(request))),
            total
        }
    }

    async findAdminGrants(query: IModelAccessAdminQuery = {}) {
        await this.policy.assertAdminChannelFeatureEnabled(query.channel)
        const scope = currentScope()
        await this.lifecycle.processDueGrants(scope)
        const take = pageSize(query.take)
        const skip = pageOffset(query.skip)
        const qb = this.grantRepository
            .createQueryBuilder('grant')
            .where('grant.tenantId = :tenantId', { tenantId: scope.tenantId })
            .orderBy('grant.createdAt', 'DESC')
            .take(take)
            .skip(skip)
        applyScopeFilter(qb, 'grant.organizationId', scope.organizationId)
        const expiresBefore = query.expiresBefore
            ? await this.policy.normalizeAdminExpiresBefore(query.expiresBefore, scope.tenantId)
            : undefined
        applyAdminFilters(qb, 'grant', query, expiresBefore)
        const [items, total] = await qb.getManyAndCount()
        return {
            items: await Promise.all(items.map((grant) => this.records.attachEventsToGrant(grant))),
            total
        }
    }

    async findAdminEvents(query: IModelAccessAdminQuery = {}) {
        await this.policy.assertAdminChannelFeatureEnabled(query.channel)
        const scope = currentScope()
        const take = pageSize(query.take)
        const skip = pageOffset(query.skip)
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
        applyScopeFilter(qb, 'event.organizationId', scope.organizationId)
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
        const actor = requireActor()
        const note = optionalText(input.note)

        return this.dataSource.transaction(async (manager) => {
            const request = await this.records.findRequestForAdminUpdate(manager, id)
            const channel = request.channel ?? ModelAccessChannelEnum.Xpert
            if (request.status === ModelAccessRequestStatusEnum.Approved) {
                const existing = await manager.getRepository(UserModelGrant).findOne({
                    where: { tenantId: request.tenantId, requestId: request.id }
                })
                return existing ? this.records.attachEventsToGrant(existing, manager) : null
            }
            if (channel === ModelAccessChannelEnum.ExternalApi) {
                await this.policy.assertModelGatewayFeatureEnabled(
                    {
                        tenantId: request.tenantId,
                        organizationId: request.organizationId ?? null
                    },
                    manager
                )
            } else {
                await this.policy.assertCurrentAdminFeatureEnabled(manager)
            }
            const validUntil = await this.policy.normalizeValidUntil(input.validUntil, manager)
            assertRequestStatus(request, ModelAccessRequestStatusEnum.Requested)
            await this.policy.requireNormalUser(request.tenantId, request.requesterId)
            const target = await this.targets.targetFromRequest(request)
            if (!target) {
                await this.lifecycle.closeRequestForSystem(
                    request,
                    ModelAccessClosedReasonCodeEnum.ModelDeleted,
                    ModelAccessEventTypeEnum.ModelDeleted,
                    manager
                )
                return null
            }
            if (!target.enabled) {
                throw new BadRequestException(
                    translate('server-ai:Error.ModelAccessModelDisabled', 'The model is currently disabled.')
                )
            }
            if (channel === ModelAccessChannelEnum.ExternalApi) {
                const [publication] = await this.targets.ensureAutomaticPublications([target], manager)
                request.gatewayPublicationId = publication.id
                request.externalModelId = publication.externalModelId
                request.modelSnapshot = {
                    ...request.modelSnapshot,
                    externalModelId: publication.externalModelId
                }
            } else {
                await this.policy.assertRequestFeatureEnabled(target, manager)
            }
            const membershipAccess = await this.membershipService.findModelAccess(
                {
                    tenantId: request.tenantId,
                    organizationId: request.requestedFromOrganizationId,
                    userId: request.requesterId
                },
                manager
            )
            if (channel === ModelAccessChannelEnum.Xpert && this.policy.isPlanIncluded(target, membershipAccess)) {
                await this.lifecycle.closeRequestForSystem(
                    request,
                    ModelAccessClosedReasonCodeEnum.PlanIncluded,
                    ModelAccessEventTypeEnum.SystemClosed,
                    manager
                )
                return null
            }

            await this.lifecycle.expireDueGrantsForModel(manager, target, request.requesterId)
            const activeGrant = await this.records.findActiveGrant(target, request.requesterId, manager, channel)
            if (activeGrant) {
                request.status = ModelAccessRequestStatusEnum.Approved
                request.decidedAt = activeGrant.approvedAt
                request.decidedById = activeGrant.approvedById
                request.decidedByName = activeGrant.approvedByName
                await manager.getRepository(ModelAccessRequest).save(request)
                return this.records.attachEventsToGrant(activeGrant, manager)
            }

            const decidedAt = new Date()
            const fromStatus = request.status
            request.status = ModelAccessRequestStatusEnum.Approved
            request.decidedAt = decidedAt
            request.decidedById = actor.id
            request.decidedByName = userName(actor)
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
                    approvedByName: userName(actor),
                    gatewayPublicationId: request.gatewayPublicationId,
                    externalModelId: request.externalModelId,
                    modelSnapshot: request.modelSnapshot
                })
            )
            await this.records.writeEvent(manager, {
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
            await this.records.writeEvent(manager, {
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
            return this.records.attachEventsToGrant(grant, manager)
        })
    }

    async rejectRequest(id: string, input: TModelAccessRequestRejectInput): Promise<IModelAccessRequest> {
        const actor = requireActor()
        const reason = requireText(
            input.reason,
            'server-ai:Error.ModelAccessRejectionReasonRequired',
            'Rejection reason is required.'
        )
        return this.dataSource.transaction(async (manager) => {
            const request = await this.records.findRequestForAdminUpdate(manager, id)
            await this.policy.assertAdminChannelFeatureEnabled(request.channel ?? ModelAccessChannelEnum.Xpert, manager)
            if (request.status === ModelAccessRequestStatusEnum.Rejected) {
                return this.records.attachEventsToRequest(request, manager)
            }
            assertRequestStatus(request, ModelAccessRequestStatusEnum.Requested)
            const fromStatus = request.status
            request.status = ModelAccessRequestStatusEnum.Rejected
            request.decidedAt = new Date()
            request.decidedById = actor.id
            request.decidedByName = userName(actor)
            request.decisionReason = reason
            const saved = await manager.getRepository(ModelAccessRequest).save(request)
            await this.records.writeEvent(manager, {
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
            return this.records.attachEventsToRequest(saved, manager)
        })
    }

    async extendGrant(id: string, input: TUserModelGrantExtendInput): Promise<IUserModelGrant> {
        await this.lifecycle.processDueGrants(currentScope())
        const actor = requireActor()
        const note = optionalText(input.note)
        return this.dataSource.transaction(async (manager) => {
            const grant = await this.records.findGrantForAdminUpdate(manager, id)
            await this.policy.assertAdminChannelFeatureEnabled(grant.channel ?? ModelAccessChannelEnum.Xpert, manager)
            const validUntil = await this.policy.normalizeValidUntil(input.validUntil, manager)
            if (grant.status !== UserModelGrantStatusEnum.Active) {
                throw new BadRequestException(
                    translate('server-ai:Error.ModelAccessGrantNotActive', 'Only active grants can be extended.')
                )
            }
            if (!grant.validUntil) {
                throw new BadRequestException(
                    translate('server-ai:Error.ModelAccessGrantAlreadyPermanent', 'The grant is already permanent.')
                )
            }
            if (validUntil && validUntil.getTime() <= new Date(grant.validUntil).getTime()) {
                throw new BadRequestException(
                    translate(
                        'server-ai:Error.ModelAccessGrantCannotShorten',
                        'The new expiration must be later than the current expiration.'
                    )
                )
            }
            const previousValidUntil = new Date(grant.validUntil)
            grant.validUntil = validUntil
            const saved = await manager.getRepository(UserModelGrant).save(grant)
            await this.records.writeEvent(manager, {
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
            return this.records.attachEventsToGrant(saved, manager)
        })
    }

    async revokeGrant(id: string, input: TUserModelGrantRevokeInput): Promise<IUserModelGrant> {
        await this.lifecycle.processDueGrants(currentScope())
        const actor = requireActor()
        const reason = requireText(
            input.reason,
            'server-ai:Error.ModelAccessRevocationReasonRequired',
            'Revocation reason is required.'
        )
        return this.dataSource.transaction(async (manager) => {
            const grant = await this.records.findGrantForAdminUpdate(manager, id)
            await this.policy.assertAdminChannelFeatureEnabled(grant.channel ?? ModelAccessChannelEnum.Xpert, manager)
            if (grant.status === UserModelGrantStatusEnum.Revoked) {
                return this.records.attachEventsToGrant(grant, manager)
            }
            if (grant.status !== UserModelGrantStatusEnum.Active) {
                throw new BadRequestException(
                    translate('server-ai:Error.ModelAccessGrantNotActive', 'Only active grants can be revoked.')
                )
            }
            const fromStatus = grant.status
            grant.status = UserModelGrantStatusEnum.Revoked
            grant.revokedAt = new Date()
            grant.revokedById = actor.id
            grant.revokedByName = userName(actor)
            grant.revokeReason = reason
            const saved = await manager.getRepository(UserModelGrant).save(grant)
            await this.records.writeEvent(manager, {
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
            return this.records.attachEventsToGrant(saved, manager)
        })
    }
}
