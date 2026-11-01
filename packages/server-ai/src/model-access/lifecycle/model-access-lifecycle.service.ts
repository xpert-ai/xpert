import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    AiModelTypeEnum,
    ModelAccessActorTypeEnum,
    ModelAccessChannelEnum,
    ModelAccessClosedReasonCodeEnum,
    ModelAccessEventTypeEnum,
    ModelAccessRequestStatusEnum,
    ModelAccessUnavailableReasonEnum,
    UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { Copilot } from '../../copilot/copilot.entity'
import { MembershipService } from '../../membership/membership.service'
import { ModelAccessRequest } from '../model-access-request.entity'
import { ModelAccessLifecycleBatchInput, ModelAccessLifecycleBatchResult, ModelTarget } from '../model-access.types'
import { MAX_PAGE_SIZE } from '../model-access.utils'
import { UserModelGrant } from '../user-model-grant.entity'

import { ModelAccessPolicyService } from '../policy/model-access-policy.service'
import { ModelAccessRecordsService } from '../requests/model-access-records.service'
import { ModelAccessTargetsService } from '../catalog/model-access-targets.service'
import { applyScopeFilter, translate } from '../model-access.utils'

@Injectable()
export class ModelAccessLifecycleService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(UserModelGrant)
        private readonly grantRepository: Repository<UserModelGrant>,
        @InjectRepository(ModelAccessRequest)
        private readonly requestRepository: Repository<ModelAccessRequest>,
        private readonly membershipService: MembershipService,
        private readonly records: ModelAccessRecordsService,
        private readonly targets: ModelAccessTargetsService,
        private readonly policy: ModelAccessPolicyService
    ) {}

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
                applyScopeFilter(qb, 'grant.organizationId', filter.organizationId ?? null)
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
                await this.records.writeEvent(manager, {
                    tenantId: grant.tenantId,
                    organizationId: grant.organizationId ?? null,
                    requestId: grant.requestId,
                    grantId: grant.id,
                    eventType: ModelAccessEventTypeEnum.GrantExpired,
                    actorType: ModelAccessActorTypeEnum.System,
                    fromStatus,
                    toStatus: grant.status,
                    reason: translate('server-ai:Error.ModelAccessGrantExpiredReason', 'Grant validity period ended.'),
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
                await this.records.writeEvent(manager, {
                    tenantId: grant.tenantId,
                    organizationId: grant.organizationId ?? null,
                    requestId: grant.requestId,
                    grantId: grant.id,
                    eventType: ModelAccessEventTypeEnum.UserLeftOrganization,
                    actorType: ModelAccessActorTypeEnum.System,
                    fromStatus,
                    toStatus: grant.status,
                    reason: translate(
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

    async reconcilePendingRequest(request: ModelAccessRequest) {
        const target = await this.targets.targetFromRequest(request)
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
        if (this.policy.isPlanIncluded(target, access)) {
            await this.closeRequestForSystem(
                request,
                ModelAccessClosedReasonCodeEnum.PlanIncluded,
                ModelAccessEventTypeEnum.SystemClosed
            )
            return true
        }
        return false
    }

    async closeRequestForSystem(
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
                    : await this.records.findRequestForUpdate(transactionManager, request.id, request.tenantId)
            if (current.status !== ModelAccessRequestStatusEnum.Requested) {
                return current
            }
            const fromStatus = current.status
            current.status = ModelAccessRequestStatusEnum.Closed
            current.closedReasonCode = reasonCode
            current.decidedAt = new Date()
            current.decisionReason = reasonCode
            const saved = await repository.save(current)
            await this.records.writeEvent(transactionManager, {
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

    async reconcileGrantAvailability(grant: UserModelGrant) {
        const target = await this.targets.loadTarget(
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
                ? await this.policy.isModelGatewayFeatureEnabled({
                      tenantId: grant.tenantId,
                      organizationId: grant.organizationId ?? null
                  })
                : await this.policy.isModelAccessFeatureEnabled({
                      tenantId: grant.tenantId,
                      organizationId: grant.organizationId ?? null
                  })
        const unavailableReason = (await this.policy.isTechnicalUser(grant.tenantId, grant.userId))
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

    async revokeGrantForDeletedModel(grant: UserModelGrant) {
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
            await this.records.writeEvent(manager, {
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

    async recordGrantAvailability(grant: UserModelGrant, unavailableReason: ModelAccessUnavailableReasonEnum | null) {
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
            await this.records.writeEvent(manager, {
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

    async expireDueGrantsForModel(manager: EntityManager, target: ModelTarget, userId: string) {
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
            await this.records.writeEvent(manager, {
                tenantId: grant.tenantId,
                organizationId: grant.organizationId ?? null,
                requestId: grant.requestId,
                grantId: grant.id,
                eventType: ModelAccessEventTypeEnum.GrantExpired,
                actorType: ModelAccessActorTypeEnum.System,
                fromStatus: UserModelGrantStatusEnum.Active,
                toStatus: UserModelGrantStatusEnum.Expired,
                reason: translate('server-ai:Error.ModelAccessGrantExpiredReason', 'Grant validity period ended.'),
                idempotencyKey: `grant:${grant.id}:expired`,
                modelSnapshot: grant.modelSnapshot
            })
        }
    }
}
