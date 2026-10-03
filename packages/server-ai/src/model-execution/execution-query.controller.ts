import { Controller, Get, Query } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ModelExecutionCallOptions, ModelExecutionCallView } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { In, Repository } from 'typeorm'
import { TenantSetting, ZodValidationPipe } from '@xpert-ai/server-core'
import { ExecutionCallQuery, executionCallQuerySchema } from './execution-query.schema'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelExecutionGrant } from './execution.entity'
import { executionError } from './execution-errors'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import {
    createMembershipUsageQuery,
    resolveMembershipPointRate,
    USAGE_POINTS_SQL
} from '../membership/membership-usage-points'

@Controller('model-execution')
export class ModelExecutionQueryController {
    constructor(
        @InjectRepository(ModelGatewayCall) private readonly calls: Repository<ModelGatewayCall>,
        @InjectRepository(ModelExecutionGrant) private readonly grants: Repository<ModelExecutionGrant>,
        @InjectRepository(MembershipPointLedger) private readonly points: Repository<MembershipPointLedger>,
        @InjectRepository(TenantSetting) private readonly settings: Repository<TenantSetting>
    ) {}

    @Get('call-options')
    async options(): Promise<ModelExecutionCallOptions> {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId(),
            userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId || RequestContext.currentApiPrincipal())
            throw executionError('Denied')
        const [assistants, models, tools] = await Promise.all([
            this.grants
                .createQueryBuilder('execution')
                .select(`execution.context->>'xpertId'`, 'id')
                .addSelect(`COALESCE(execution.context->>'assistantName', execution.context->>'xpertId')`, 'name')
                .distinctOn(["execution.context->>'xpertId'"])
                .where({ tenantId, organizationId, ownerId: userId })
                .orderBy("execution.context->>'xpertId'")
                .addOrderBy('execution.createdAt', 'DESC')
                .limit(200)
                .getRawMany<{ id: string; name: string }>(),
            this.scopedCalls(tenantId, organizationId, userId)
                .select('call.model', 'value')
                .distinct(true)
                .orderBy('call.model')
                .limit(500)
                .getRawMany<{ value: string }>(),
            this.scopedCalls(tenantId, organizationId, userId)
                .select("execution.context->'tool'->>'id'", 'value')
                .distinct(true)
                .orderBy("execution.context->'tool'->>'id'")
                .limit(500)
                .getRawMany<{ value: string }>()
        ])
        return { assistants, models: models.map((item) => item.value), tools: tools.map((item) => item.value) }
    }

    private scopedCalls(tenantId: string, organizationId: string, userId: string) {
        return this.calls
            .createQueryBuilder('call')
            .innerJoin(
                ModelExecutionGrant,
                'execution',
                'execution.id = call.grantId AND execution.tenantId = call.tenantId AND execution.organizationId = call.organizationId AND execution.ownerId = call.userId'
            )
            .where('call.tenantId = :tenantId AND call.organizationId = :organizationId AND call.userId = :userId', {
                tenantId,
                organizationId,
                userId
            })
            .andWhere("call.source = 'execution_grant'")
    }

    @Get('calls')
    async list(
        @Query(new ZodValidationPipe(executionCallQuerySchema, () => executionError('Invalid')))
        filter: ExecutionCallQuery
    ): Promise<{ items: ModelExecutionCallView[]; total: number }> {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId(),
            userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId || RequestContext.currentApiPrincipal())
            throw executionError('Denied')
        const query = this.scopedCalls(tenantId, organizationId, userId).addSelect('call.usageFact')
        if (filter.model) query.andWhere('call.model = :model', { model: filter.model })
        if (filter.usageSource) query.andWhere('call.usageSource = :usageSource', { usageSource: filter.usageSource })
        if (filter.environment)
            query.andWhere("execution.context->'environment'->>'type' = :environment", {
                environment: filter.environment
            })
        if (filter.pricingStatus)
            query.andWhere(
                `COALESCE("call"."usageFact"->>'pricingStatus', CASE WHEN "call"."errorCode" = 'reconciled_no_usage' THEN 'free' ELSE 'pending' END) = :pricingStatus`,
                { pricingStatus: filter.pricingStatus }
            )
        if (filter.startedAfter)
            query.andWhere('call.startedAt >= :startedAfter', { startedAfter: filter.startedAfter })
        if (filter.startedBefore)
            query.andWhere('call.startedAt <= :startedBefore', { startedBefore: filter.startedBefore })
        if (filter.status) query.andWhere('call.status = :status', { status: filter.status })
        if (filter.entry)
            query.andWhere("execution.context->'source'->>'type' = :entry", {
                entry: ({ cli: 'cli_session', agent_runtime: 'agent_invocation', shell: 'shell_execution' } as const)[
                    filter.entry
                ]
            })
        const fields = {
            assistantId: "execution.context->>'xpertId'",
            conversationId: "execution.context->>'conversationId'",
            executionId:
                "COALESCE(execution.context->'source'->>'cliSessionId', execution.context->'source'->>'invocationId', execution.context->'source'->>'executionId')",
            tool: "execution.context->'tool'->>'id'"
        }
        for (const key of ['assistantId', 'conversationId', 'executionId', 'tool'] as const) {
            if (filter[key]) query.andWhere(`${fields[key]} = :${key}`, { [key]: filter[key] })
        }
        const [calls, total] = await query
            .orderBy('call.startedAt', 'DESC')
            .addOrderBy('call.id', 'DESC')
            .skip(filter.skip)
            .take(filter.take)
            .getManyAndCount()
        if (!calls.length) return { items: [], total }
        const grants = await this.grants.findBy({
            id: In(calls.map((call) => call.grantId)),
            tenantId,
            organizationId,
            ownerId: userId
        })
        const byId = new Map(grants.map((grant) => [grant.id, grant]))
        const pointRows = await createMembershipUsageQuery(
            this.points,
            { tenantId, userId },
            await resolveMembershipPointRate(this.settings, tenantId)
        )
            .select(`"ledger"."executionContext"->>'attemptId'`, 'attemptId')
            .addSelect(
                `CASE WHEN COUNT(*) FILTER (WHERE (${USAGE_POINTS_SQL}) IS NULL) > 0
                THEN NULL ELSE SUM(${USAGE_POINTS_SQL}) END`,
                'points'
            )
            .andWhere('ledger.runtimeOrganizationId = :organizationId', { organizationId })
            .andWhere(`"ledger"."executionContext"->>'attemptId' IN (:...attemptIds)`, {
                attemptIds: calls.map((call) => call.requestId)
            })
            .groupBy(`"ledger"."executionContext"->>'attemptId'`)
            .getRawMany<{ attemptId: string; points: string | null }>()
        const pointsByAttempt = new Map(
            pointRows.map((row) => [row.attemptId, row.points === null ? null : Number(row.points)])
        )
        return {
            total,
            items: calls.map((call) => {
                const grant = byId.get(call.grantId)
                if (!grant) throw executionError('Denied')
                const pricingStatus =
                    call.usageFact?.pricingStatus ?? (call.errorCode === 'reconciled_no_usage' ? 'free' : 'pending')
                const settled =
                    call.errorCode === 'reconciled_no_usage' ||
                    (Boolean(call.usageDeliveredAt) && (pricingStatus === 'priced' || pricingStatus === 'free'))
                return {
                    id: call.id,
                    callId: call.callId,
                    attemptId: call.requestId,
                    context: grant.context,
                    modelId: call.externalModelId,
                    model: call.model,
                    status: call.status,
                    usageSource: call.usageSource,
                    points: settled
                        ? pricingStatus === 'free'
                            ? 0
                            : (pointsByAttempt.get(call.requestId) ?? null)
                        : null,
                    pricingStatus,
                    startedAt: call.startedAt.toISOString(),
                    completedAt: call.completedAt?.toISOString() ?? null,
                    delivered: Boolean(call.usageDeliveredAt)
                }
            })
        }
    }
}
