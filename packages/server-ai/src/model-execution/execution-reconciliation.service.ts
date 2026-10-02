import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Interval } from '@nestjs/schedule'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelGatewayCallStatusEnum, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { IsNull, Repository } from 'typeorm'
import { isDeepStrictEqual } from 'node:util'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelExecutionGrant } from './execution.entity'
import { ModelExecutionMeteringService } from './execution-metering.service'
import { ModelExecutionReconciliation } from './execution-reconciliation.entity'
import { ExecutionReconciliationInput, executionReconciliationSchema } from './execution-reconciliation.schema'
import { executionError } from './execution-errors'

@Injectable()
export class ModelExecutionReconciliationService {
    private readonly logger = new Logger(ModelExecutionReconciliationService.name)
    constructor(
        @InjectRepository(ModelGatewayCall) private readonly calls: Repository<ModelGatewayCall>,
        @InjectRepository(ModelExecutionGrant) private readonly grants: Repository<ModelExecutionGrant>,
        @InjectRepository(ModelExecutionReconciliation)
        private readonly reviews: Repository<ModelExecutionReconciliation>,
        private readonly metering: ModelExecutionMeteringService
    ) {}

    async pending(tenantId: string, take = 50, skip = 0) {
        const [calls, total] = await this.calls.findAndCount({
            where: { tenantId, source: 'execution_grant', status: ModelGatewayCallStatusEnum.SettlementPending },
            order: { startedAt: 'ASC' },
            take,
            skip
        })
        return {
            total,
            items: calls.map((call) => ({
                id: call.id,
                attemptId: call.requestId,
                callId: call.callId,
                organizationId: call.organizationId,
                userId: call.userId,
                model: call.model,
                usageSource: call.usageSource,
                actualTokens: call.totalTokens,
                estimatedUsage: call.estimatedUsage,
                reservedTokens: call.reservedTokens,
                startedAt: call.startedAt,
                errorCode: call.errorCode
            }))
        }
    }

    async reconcile(tenantId: string, callId: string, evidence: ExecutionReconciliationInput) {
        const reviewerId = RequestContext.currentUserId()
        if (!reviewerId || RequestContext.currentApiPrincipal()) throw executionError('Invalid')
        const review = await this.calls.manager
            .transaction(async (manager) => {
                const call = await manager
                    .getRepository(ModelGatewayCall)
                    .createQueryBuilder('call')
                    .addSelect('call.usageFact')
                    .where({ id: callId, tenantId, source: 'execution_grant' })
                    .setLock('pessimistic_write')
                    .getOne()
                if (!call) throw executionError('Denied')
                const repository = manager.getRepository(ModelExecutionReconciliation)
                const previous = await repository.findOneBy({ tenantId, callId })
                if (previous) {
                    if (!isDeepStrictEqual(previous.evidence, evidence)) throw executionError('Invalid')
                    return previous
                }
                if (
                    call.status !== ModelGatewayCallStatusEnum.SettlementPending ||
                    call.usageFact ||
                    call.usageDeliveredAt
                )
                    throw executionError('Invalid')
                const created = repository.create({
                    id: evidence.operationId,
                    tenantId,
                    organizationId: call.organizationId,
                    callId,
                    reviewerId,
                    evidence
                })
                // Evidence is append-only. save() would overwrite a different review when its ID is reused.
                await repository.insert(created)
                return created
            })
            .catch((error: unknown) => {
                if (error instanceof Error && 'code' in error && error.code === '23505') throw executionError('Invalid')
                throw error
            })
        await this.apply(review)
        return { id: review.id, status: 'applied' }
    }

    async retryDelivery(tenantId: string, callId: string) {
        const call = await this.calls.findOneBy({ id: callId, tenantId, source: 'execution_grant' })
        if (!call) throw executionError('Denied')
        await this.metering.deliver(callId)
        return { delivered: Boolean((await this.calls.findOneByOrFail({ id: callId, tenantId })).usageDeliveredAt) }
    }

    async apply(review: ModelExecutionReconciliation) {
        if (review.appliedAt) return
        const evidence = executionReconciliationSchema.parse(review.evidence)
        const call = await this.calls
            .createQueryBuilder('call')
            .addSelect(['call.usageFact', 'call.settlementContext'])
            .where({ id: review.callId, tenantId: review.tenantId, source: 'execution_grant' })
            .getOneOrFail()
        if (evidence.outcome === 'no_usage') {
            // An explicit verified zero-usage receipt is required; timeout/estimation is never enough.
            await this.calls.manager.transaction(async (manager) => {
                const current = await manager
                    .getRepository(ModelGatewayCall)
                    .createQueryBuilder('call')
                    .addSelect('call.usageFact')
                    .where({ id: call.id, tenantId: call.tenantId })
                    .setLock('pessimistic_write')
                    .getOneOrFail()
                if (current.usageFact || current.usageDeliveredAt) throw executionError('Invalid')
                current.status = ModelGatewayCallStatusEnum.Failed
                current.errorCode = 'reconciled_no_usage'
                current.reservedTokens = 0
                current.completedAt ??= new Date()
                current.priceAmount = 0
                current.priceCurrency = evidence.priceCurrency
                await manager.save(current)
                await manager.getRepository(ModelExecutionReconciliation).update(review.id, { appliedAt: new Date() })
            })
            return
        }
        const grant = await this.grants.findOneByOrFail({ id: call.grantId, tenantId: call.tenantId })
        const model = grant.models.find((item) => item.id === call.externalModelId)
        if (!model || !call.settlementContext) throw executionError('Invalid')
        await this.metering.finish({
            call,
            grant,
            model,
            resolution: call.settlementContext,
            providerUsage: null,
            providerRequestId: evidence.providerRequestId,
            priceAuthority: 'provider',
            usage: {
                source: ModelGatewayUsageSourceEnum.Provider,
                inputTokens: evidence.inputTokens,
                outputTokens: evidence.outputTokens,
                totalTokens: evidence.totalTokens,
                priceAmount: evidence.priceAmount,
                priceCurrency: evidence.priceCurrency
            }
        })
        await this.reviews.update(review.id, { appliedAt: new Date() })
    }

    @Interval(30_000)
    async retry() {
        const reviews = await this.reviews.find({
            where: { appliedAt: IsNull() },
            order: { createdAt: 'ASC' },
            take: 100
        })
        for (const review of reviews) {
            try {
                await this.apply(review)
            } catch {
                this.logger.warn('Model execution reconciliation remains pending')
            }
        }
    }
}
