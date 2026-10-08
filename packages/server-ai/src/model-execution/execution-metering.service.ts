import { recoverAbandonedExecutionCalls } from './execution-recovery'
import { modelExecutionEntry } from '@xpert-ai/contracts'
import { isDeepStrictEqual } from 'node:util'
import { applicationMetrics } from '../metrics/application-metrics'
import { z } from 'zod/v3'
// Why this exists: persist provider facts before delivering them to the existing ledger.
// A crashed delivery is retried with the same attempt ID; estimated usage never becomes a charge.
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { Interval } from '@nestjs/schedule'
import {
    ILLMUsage,
    IModelAccessResolution,
    ModelExecutionModel,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageSourceEnum
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelGatewayUsage } from '../model-gateway/model-gateway.service'
import { CopilotTokenRecordCommand } from '../copilot-user/commands/token-record.command'
import { ExceedingLimitException } from '../core/errors'
import { ModelUsageDeliveryReceipt } from '../copilot-usage/model-usage/model-usage-delivery-receipt.entity'
import { ExecutionUsageFact, ModelExecutionGrant } from './execution.entity'
import { executionUsageEstimateSchema } from './execution-usage-schema'
import { executionError } from './execution-errors'

@Injectable()
export class ModelExecutionMeteringService {
    private readonly logger = new Logger(ModelExecutionMeteringService.name)
    constructor(
        @InjectRepository(ModelGatewayCall) private readonly calls: Repository<ModelGatewayCall>,
        @InjectRepository(ModelExecutionGrant) private readonly grants: Repository<ModelExecutionGrant>,
        private readonly commands: CommandBus
    ) {}

    async finish(input: {
        call: ModelGatewayCall
        grant: ModelExecutionGrant
        model: ModelExecutionModel
        resolution: IModelAccessResolution
        usage: ModelGatewayUsage
        providerUsage: ILLMUsage | null
        error?: unknown
        priceAuthority?: 'catalog' | 'provider'
        providerRequestId?: string
    }) {
        const { call, grant, usage } = input
        const actual = usage.source === ModelGatewayUsageSourceEnum.Provider && usage.totalTokens > 0
        const context = grant.context
        const price = input.providerUsage
        const fact: ExecutionUsageFact | null = actual
            ? {
                  context: {
                      entry: modelExecutionEntry(context.source),
                      environment: context.environment,
                      actorUserId: context.actorUserId,
                      billableUserId: context.billableUserId,
                      assistantVersion: context.assistantVersion,
                      conversationId: context.conversationId,
                      source: context.source,
                      grantId: grant.id,
                      callId: call.callId,
                      attemptId: call.requestId,
                      providerRequestId: input.providerRequestId,
                      tool: context.tool
                  },
                  promptTokens: usage.inputTokens,
                  completionTokens: usage.outputTokens,
                  totalTokens: usage.totalTokens,
                  model: input.model,
                  cacheReadInputTokens: usage.cacheReadInputTokens,
                  cacheWriteInputTokens: usage.cacheWriteInputTokens,
                  reasoningTokens: usage.reasoningTokens,
                  priceAuthority:
                      usage.priceAmount == null ? undefined : (input.priceAuthority ?? price?.priceAuthority),
                  pricingBreakdown: usage.priceAmount == null ? undefined : price?.pricingBreakdown,
                  priceAmount: price?.pricingStatus === 'unpriced' ? undefined : (usage.priceAmount ?? undefined),
                  currency: usage.priceCurrency ?? undefined,
                  pricingStatus:
                      price?.pricingStatus === 'unpriced' || usage.priceAmount == null
                          ? 'unpriced'
                          : usage.priceAmount === 0
                            ? 'free'
                            : 'priced'
              }
            : null
        await this.calls.manager.transaction(async (manager) => {
            const current = await manager
                .getRepository(ModelGatewayCall)
                .createQueryBuilder('call')
                .addSelect(['call.usageFact', 'call.settlementContext'])
                .where('call.id = :id AND call.grantId = :grantId AND call.source = :source', {
                    id: call.id,
                    grantId: grant.id,
                    source: 'execution_grant'
                })
                .setLock('pessimistic_write')
                .getOneOrFail()
            if (
                current.usageFact &&
                fact &&
                !isDeepStrictEqual(JSON.parse(JSON.stringify(current.usageFact)), JSON.parse(JSON.stringify(fact)))
            )
                throw executionError('Invalid')
            if (current.errorCode === 'reconciled_no_usage') throw executionError('Invalid')
            if (current.usageFact || current.usageDeliveredAt) return
            current.completedAt = new Date()
            current.durationMs = current.completedAt.getTime() - current.startedAt.getTime()
            current.status = ModelGatewayCallStatusEnum.SettlementPending
            current.errorCode = input.error ? 'execution_interrupted' : null
            current.usageSource = usage.source
            if (usage.source === ModelGatewayUsageSourceEnum.Estimated) {
                const estimate = executionUsageEstimateSchema.safeParse({
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    totalTokens: usage.totalTokens
                })
                if (estimate.success)
                    current.estimatedUsage = {
                        inputTokens: estimate.data.inputTokens,
                        outputTokens: estimate.data.outputTokens,
                        totalTokens: estimate.data.totalTokens
                    }
            }
            current.usageFact = fact
            current.settlementContext = input.resolution
            if (!fact && !current.dispatchedAt) {
                current.status = ModelGatewayCallStatusEnum.Failed
                current.errorCode = 'execution_preflight_failed'
                current.usageSource = ModelGatewayUsageSourceEnum.None
                current.reservedTokens = 0
            }
            if (fact) {
                current.inputTokens = fact.promptTokens
                current.outputTokens = fact.completionTokens
                current.totalTokens = fact.totalTokens
                current.reservedTokens = 0
                current.priceAmount = fact.priceAmount ?? null
                current.priceCurrency = fact.currency ?? null
            }
            await manager.save(current)
        })
        applicationMetrics.recordModelExecution(fact ? 'provider_usage' : 'usage_pending')
        if (fact) await this.deliver(call.id)
    }

    async deliver(id: string) {
        const call = await this.calls
            .createQueryBuilder('call')
            .addSelect(['call.usageFact', 'call.settlementContext'])
            .where('call.id = :id AND call.source = :source', { id, source: 'execution_grant' })
            .getOne()
        if (!call?.usageFact || call.usageDeliveredAt) return
        const grant = await this.grants.findOneBy({ id: call.grantId, tenantId: call.tenantId })
        const model = call.usageFact.model
        if (!grant || !model || !call.settlementContext) throw executionError('Invalid')
        const fact = call.usageFact
        try {
            await this.commands.execute(
                new CopilotTokenRecordCommand({
                    tenantId: call.tenantId,
                    requestId: call.requestId,
                    organizationId: grant.context.runtimeOrganizationId,
                    userId: grant.context.billableUserId,
                    xpertId: grant.context.xpertId,
                    threadId: grant.context.threadId,
                    copilotId: model.copilotId,
                    model: model.model,
                    modelType: model.modelType,
                    modelAccess: call.settlementContext,
                    promptTokens: fact.promptTokens,
                    completionTokens: fact.completionTokens,
                    tokenUsed: fact.totalTokens,
                    priceUsed: fact.priceAmount,
                    currency: fact.currency,
                    pricingStatus: fact.pricingStatus,
                    priceAuthority: fact.priceAuthority,
                    pricingBreakdown: fact.pricingBreakdown,
                    execution: fact.context,
                    executionModel: model,
                    tokenDetails: {
                        cacheReadInputTokens: fact.cacheReadInputTokens,
                        cacheWriteInputTokens: fact.cacheWriteInputTokens,
                        reasoningTokens: fact.reasoningTokens
                    }
                })
            )
        } catch (error) {
            // Limit errors can occur before settlement or after a completed quota update.
            // Only a durable receipt proves the latter; the exception alone is not an acknowledgement.
            const delivered =
                error instanceof ExceedingLimitException
                    ? await this.calls.manager.findOne(ModelUsageDeliveryReceipt, {
                          where: {
                              tenantId: call.tenantId,
                              providerScopeId: model.providerScopeId,
                              requestId: call.requestId,
                              status: 'completed'
                          }
                      })
                    : null
            if (!delivered) {
                applicationMetrics.recordModelExecution('delivery_retry')
                this.logger.warn('Model execution settlement remains pending.')
                return
            }
        }
        // Charges and token facts share the execution dimensions. A failed delivery is safely replayed.
        await this.calls.manager.query(
            `UPDATE membership_point_ledger charge SET
            "usageChannel" = fact."usageChannel", "executionContext" = fact."executionContext", "actorId" = fact."actorId"
            FROM membership_point_ledger fact WHERE fact."tenantId" = $1 AND fact."requestId" = $2
              AND fact."providerScopeId" = $3 AND fact.source = 'model_usage'
              AND charge."tenantId" = fact."tenantId" AND charge."sourceReference" IN
                ('model-usage-charge:' || fact.id, 'model-usage-charge:' || fact.id || ':personal')`,
            [call.tenantId, call.requestId, model.providerScopeId]
        )
        await this.calls.update(id, {
            usageDeliveredAt: new Date(),
            status: call.errorCode ? ModelGatewayCallStatusEnum.Failed : ModelGatewayCallStatusEnum.Succeeded
        })
    }

    @Interval(30_000)
    async retry() {
        // A lost worker does not release an uncertain provider attempt's reservation.
        await recoverAbandonedExecutionCalls(this.calls.manager)
        const totals = z
            .array(
                z.object({
                    attempts: z.coerce.number().nonnegative(),
                    reservedTokens: z.coerce.number().nonnegative(),
                    oldestSeconds: z.coerce.number().nonnegative()
                })
            )
            .parse(
                await this.calls.manager.query(`SELECT
            COUNT(*) AS attempts, COALESCE(SUM("reservedTokens"), 0) AS "reservedTokens",
            COALESCE(EXTRACT(EPOCH FROM now() - MIN("startedAt")), 0) AS "oldestSeconds"
            FROM model_gateway_call WHERE source = 'execution_grant' AND status = 'settlement_pending'`)
            )
        if (totals[0])
            applicationMetrics.setModelExecutionPending({
                attempts: totals[0].attempts ?? 0,
                reservedTokens: totals[0].reservedTokens ?? 0,
                oldestSeconds: totals[0].oldestSeconds ?? 0
            })
        const pending = await this.calls
            .createQueryBuilder('call')
            .where(
                "call.source = 'execution_grant' AND call.status = 'settlement_pending' AND call.usageFact IS NOT NULL"
            )
            .orderBy('call.createdAt', 'ASC')
            .take(100)
            .getMany()
        for (const call of pending) {
            try {
                await this.deliver(call.id)
            } catch {
                this.logger.warn('Model execution fact could not be delivered.')
            }
        }
    }
}
