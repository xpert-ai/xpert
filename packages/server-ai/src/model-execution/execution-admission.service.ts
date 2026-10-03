import { applicationMetrics } from '../metrics/application-metrics'
// Invariants: serialize all grants for a payer before checking available tokens.
// Unknown attempts retain their reservation; only persisted provider facts release it.
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { ModelExecutionModel, ModelGatewayCallStatusEnum, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { DataSource, EntityManager } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'
import { ModelExecutionGrant } from './execution.entity'
import { executionError } from './execution-errors'

const totalsSchema = z
    .array(
        z.object({
            used: z.coerce.number().nonnegative(),
            reserved: z.coerce.number().nonnegative(),
            concurrent: z.coerce.number().nonnegative(),
            recent: z.coerce.number().nonnegative()
        })
    )
    .length(1)
export function assertExecutionAdmission(input: {
    budget: number
    used: number
    reserved: number
    reservation: number
    concurrent: number
    maxConcurrent: number
    recent: number
    rpm: number
}) {
    if (
        input.used + input.reserved + input.reservation > input.budget ||
        input.concurrent >= input.maxConcurrent ||
        input.recent >= input.rpm
    ) {
        throw executionError('Budget')
    }
}

@Injectable()
export class ModelExecutionAdmissionService {
    constructor(@InjectDataSource() private readonly database: DataSource) {}

    /** Fence a single upstream attempt. A crash after this point retains the reservation. */
    async dispatch(call: ModelGatewayCall, grant: ModelExecutionGrant) {
        call.dispatchedAt = await this.database.transaction(async (manager) => {
            await this.lockGrant(manager, grant)
            const attempt = await manager.findOne(ModelGatewayCall, {
                where: {
                    id: call.id,
                    grantId: grant.id,
                    source: 'execution_grant',
                    status: ModelGatewayCallStatusEnum.Started
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!attempt || attempt.dispatchedAt) throw executionError('Denied')
            // Revalidation may tighten a budget after this attempt reserved its tokens.
            // Include this reservation once and keep the same payer-first lock order as admission.
            for (const [id, budget] of [
                [grant.id, grant.limits.tokenBudget],
                [null, grant.limits.userTokenBudget]
            ] as const) {
                const totals = await this.aggregate(manager, grant, id)
                if (totals.used + totals.reserved > budget) throw executionError('Budget')
            }
            const parent = await this.parentTotals(manager, grant)
            if (parent && parent.used + parent.reserved > Math.min(parent.budget, grant.limits.tokenBudget))
                throw executionError('Budget')
            attempt.dispatchedAt = new Date()
            await manager.save(attempt)
            return attempt.dispatchedAt
        })
    }

    async begin(grant: ModelExecutionGrant, model: ModelExecutionModel, outputLimit: number) {
        return this.database.transaction(async (manager) => {
            await this.lockGrant(manager, grant)
            if (!Number.isSafeInteger(outputLimit) || outputLimit <= 0 || outputLimit > grant.limits.maxOutputTokens)
                throw executionError('OutputLimit')
            const reservation = grant.limits.maxInputTokens + outputLimit
            for (const [id, budget] of [
                [grant.id, grant.limits.tokenBudget],
                [null, grant.limits.userTokenBudget]
            ] as const) {
                const totals = await this.aggregate(manager, grant, id)
                assertExecutionAdmission({
                    used: totals.used!,
                    reserved: totals.reserved!,
                    concurrent: totals.concurrent!,
                    recent: totals.recent!,
                    budget,
                    reservation,
                    maxConcurrent: grant.limits.maxConcurrentRequests,
                    rpm: grant.limits.requestsPerMinute
                })
            }
            const parent = await this.parentTotals(manager, grant)
            if (parent)
                assertExecutionAdmission({
                    used: parent.used,
                    reserved: parent.reserved,
                    budget: Math.min(parent.budget, grant.limits.tokenBudget),
                    concurrent: parent.concurrent,
                    recent: parent.recent,
                    reservation,
                    maxConcurrent: grant.limits.maxConcurrentRequests,
                    rpm: grant.limits.requestsPerMinute
                })
            applicationMetrics.recordModelExecution('admitted')
            const requestId = randomUUID()
            return manager.save(
                ModelGatewayCall,
                manager.create(ModelGatewayCall, {
                    tenantId: grant.tenantId,
                    organizationId: grant.organizationId,
                    userId: grant.ownerId,
                    source: 'execution_grant',
                    grantId: grant.id,
                    apiKeyId: null,
                    publicationId: null,
                    requestId,
                    callId: randomUUID(),
                    externalModelId: model.id,
                    provider: model.provider,
                    model: model.model,
                    status: ModelGatewayCallStatusEnum.Started,
                    startedAt: new Date(),
                    reservedTokens: reservation,
                    usageSource: ModelGatewayUsageSourceEnum.None,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    chargedPoints: 0,
                    excessPoints: 0
                })
            )
        })
    }

    private async lockGrant(manager: EntityManager, grant: ModelExecutionGrant) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `model-execution:${grant.tenantId}:${grant.ownerId}`
        ])
        const current = await manager.findOne(ModelExecutionGrant, {
            where: {
                id: grant.id,
                tenantId: grant.tenantId,
                organizationId: grant.organizationId,
                ownerId: grant.ownerId,
                status: 'active'
            },
            lock: { mode: 'pessimistic_write' }
        })
        if (!current || current.expiresAt.getTime() <= Date.now() || current.absoluteExpiresAt.getTime() <= Date.now())
            throw executionError('Denied')
        for (const key of Object.keys(grant.limits) as Array<keyof ModelExecutionGrant['limits']>) {
            grant.limits[key] = Math.min(grant.limits[key], current.limits[key])
        }
    }

    private async aggregate(manager: EntityManager, grant: ModelExecutionGrant, grantId: string | null) {
        return totalsSchema.parse(
            await manager.query(
                `
            SELECT COALESCE(SUM("totalTokens") FILTER (WHERE $3::uuid IS NOT NULL OR "startedAt" >= now() - interval '24 hours'),0) AS used,
                COALESCE(SUM("reservedTokens"),0) AS reserved,
                COUNT(*) FILTER (WHERE status = 'started') AS concurrent,
                COUNT(*) FILTER (WHERE "startedAt" >= now() - interval '1 minute') AS recent
            FROM model_gateway_call WHERE "tenantId"=$1 AND "userId"=$2 AND source='execution_grant'
                AND ($3::uuid IS NULL OR "grantId"=$3)`,
                [grant.tenantId, grant.ownerId, grantId]
            )
        )[0]
    }

    /** All CLI children of a parent share the smallest issued budget, including completed siblings. */
    private async parentTotals(manager: EntityManager, grant: ModelExecutionGrant) {
        if (grant.context.source.type !== 'shell_execution') return null
        const rows: unknown = await manager.query(
            `
            SELECT COALESCE(SUM(c."totalTokens"),0) AS used, COALESCE(SUM(c."reservedTokens"),0) AS reserved,
                COUNT(*) FILTER (WHERE c.status='started') AS concurrent,
                COUNT(*) FILTER (WHERE c."startedAt">=now()-interval '1 minute') AS recent,
                MIN((g.limits->>'tokenBudget')::bigint) AS budget
            FROM model_execution_grant g LEFT JOIN model_gateway_call c ON c."grantId"=g.id AND c.source='execution_grant'
            WHERE g."tenantId"=$1 AND g."ownerId"=$2 AND g."organizationId"=$3
                AND g.context->'source'->>'type'='shell_execution'
                AND g.context->'source'->>'parentExecutionId'=$4`,
            [grant.tenantId, grant.ownerId, grant.organizationId, grant.context.source.parentExecutionId]
        )
        return z
            .array(
                z.object({
                    used: z.coerce.number().nonnegative(),
                    reserved: z.coerce.number().nonnegative(),
                    concurrent: z.coerce.number().nonnegative(),
                    recent: z.coerce.number().nonnegative(),
                    budget: z.coerce.number().positive()
                })
            )
            .length(1)
            .parse(rows)[0]
    }
}
