import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    ModelAccessActorTypeEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum,
    UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EntityManager, Repository } from 'typeorm'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { EventInput, ModelTarget, ResolveModelInput } from './model-access.types'
import { UserModelGrant } from './user-model-grant.entity'

import { applyScopeFilter, currentScope, isUniqueViolation, translate, userName } from './model-access.utils'

@Injectable()
export class ModelAccessRecordsService {
    constructor(
        @InjectRepository(UserModelGrant)
        private readonly grantRepository: Repository<UserModelGrant>,
        @InjectRepository(ModelAccessRequest)
        private readonly requestRepository: Repository<ModelAccessRequest>,
        @InjectRepository(ModelAccessEvent)
        private readonly eventRepository: Repository<ModelAccessEvent>
    ) {}

    async findActiveGrant(
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
        applyScopeFilter(qb, 'grant.organizationId', target.organizationId)
        return qb.getOne()
    }

    async findActiveGrantByInput(input: ResolveModelInput, userId: string) {
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

    async findPendingRequest(target: ModelTarget, requesterId: string, channel = ModelAccessChannelEnum.Xpert) {
        const qb = this.requestRepository
            .createQueryBuilder('request')
            .where('request.tenantId = :tenantId', { tenantId: target.tenantId })
            .andWhere('request.channel = :channel', { channel })
            .andWhere('request.requesterId = :requesterId', { requesterId })
            .andWhere('request.copilotId = :copilotId', { copilotId: target.copilotId })
            .andWhere('request.copilotModelId = :copilotModelId', { copilotModelId: target.copilotModelId })
            .andWhere('request.modelType = :modelType', { modelType: target.modelType })
            .andWhere('request.status = :status', { status: ModelAccessRequestStatusEnum.Requested })
        applyScopeFilter(qb, 'request.organizationId', target.organizationId)
        return qb.getOne()
    }

    async findUserRequestsForCurrentContext(
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

    async findUserGrantsForCurrentContext(
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

    async findRequestForUpdate(manager: EntityManager, id: string, tenantId: string) {
        const request = await manager
            .getRepository(ModelAccessRequest)
            .createQueryBuilder('request')
            .setLock('pessimistic_write')
            .where('request.id = :id', { id })
            .andWhere('request.tenantId = :tenantId', { tenantId })
            .getOne()
        if (!request) {
            throw new NotFoundException(
                translate('server-ai:Error.ModelAccessRequestNotFound', 'Model access request not found.')
            )
        }
        return request
    }

    async findRequestForAdminUpdate(manager: EntityManager, id: string) {
        const scope = currentScope()
        const qb = manager
            .getRepository(ModelAccessRequest)
            .createQueryBuilder('request')
            .setLock('pessimistic_write')
            .where('request.id = :id', { id })
            .andWhere('request.tenantId = :tenantId', { tenantId: scope.tenantId })
        applyScopeFilter(qb, 'request.organizationId', scope.organizationId)
        const request = await qb.getOne()
        if (!request) {
            throw new NotFoundException(
                translate('server-ai:Error.ModelAccessRequestNotFound', 'Model access request not found.')
            )
        }
        return request
    }

    async findGrantForAdminUpdate(manager: EntityManager, id: string) {
        const scope = currentScope()
        const qb = manager
            .getRepository(UserModelGrant)
            .createQueryBuilder('grant')
            .setLock('pessimistic_write')
            .where('grant.id = :id', { id })
            .andWhere('grant.tenantId = :tenantId', { tenantId: scope.tenantId })
        applyScopeFilter(qb, 'grant.organizationId', scope.organizationId)
        const grant = await qb.getOne()
        if (!grant) {
            throw new NotFoundException(translate('server-ai:Error.ModelAccessGrantNotFound', 'Model grant not found.'))
        }
        return grant
    }

    async attachEventsToRequest(request: ModelAccessRequest, manager?: EntityManager) {
        const repository = manager?.getRepository(ModelAccessEvent) ?? this.eventRepository
        const events = await repository.find({
            where: { tenantId: request.tenantId, requestId: request.id },
            order: { createdAt: 'ASC' }
        })
        return { ...request, events }
    }

    async attachEventsToGrant(grant: UserModelGrant, manager?: EntityManager) {
        const repository = manager?.getRepository(ModelAccessEvent) ?? this.eventRepository
        const events = await repository.find({
            where: { tenantId: grant.tenantId, grantId: grant.id },
            order: { createdAt: 'ASC' }
        })
        return { ...grant, events }
    }

    async writeEvent(manager: EntityManager, input: EventInput) {
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
            actorName: actor ? userName(actor) : 'System',
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
            if (!isUniqueViolation(error)) {
                throw error
            }
            return manager.getRepository(ModelAccessEvent).findOne({
                where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey }
            })
        }
    }
}
