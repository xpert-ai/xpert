// Invariants: admission locks the Project; every round and Run consumes the immutable instance budget.
// Only persisted native ancestry associates a call. Unknown usage retains its reservation indefinitely.
import { ConflictException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { DataSource, IsNull, type EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import { projectPipelineNativeModelBudgetSchema } from '@xpert-ai/contracts'
import { ProjectPipelineInstanceEntity, ProjectPipelineModelReservationEntity } from '../persistence/pipeline.entity'
import { lockManagedProject, managedAudit } from '../runtime/pipeline-transaction'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import type { PipelineModelBudgetCall } from './pipeline-model-budget.command'
import { recordPipelineModelBudgetDenial } from './pipeline-model-budget-denial'
import {
    assertPipelineModelWorkOpen,
    pipelineModelDenialOperation,
    pipelineModelReservationOrigin,
    resolvePipelineModelWork
} from './pipeline-model-work'

const callSchema = z
    .object({
        actor: z
            .object({
                tenantId: z.string().uuid(),
                organizationId: z.string().uuid().optional(),
                userId: z.string().uuid()
            })
            .strict(),
        executionId: z.string().uuid(),
        requestId: z.string().uuid()
    })
    .strict()
const totalsSchema = z.object({
    calls: z.coerce.number().int().nonnegative().safe(),
    tokens: z.coerce.number().int().nonnegative().safe(),
    held: z.coerce.number().int().nonnegative().safe(),
    actual: z.coerce.number().int().nonnegative().safe()
})

export async function pipelineModelBudgetTotals(manager: EntityManager, instance: ProjectPipelineInstanceEntity) {
    const row: unknown = await manager
        .getRepository(ProjectPipelineModelReservationEntity)
        .createQueryBuilder('call')
        .withDeleted()
        .select('COUNT(*)', 'calls')
        .addSelect('COALESCE(SUM(COALESCE(call."actualTokens", call."reservedTokens")), 0)', 'tokens')
        .addSelect('COUNT(*) FILTER (WHERE call.state = :held)', 'held')
        .addSelect('COALESCE(SUM(call."actualTokens"), 0)', 'actual')
        .where({
            tenantId: instance.tenantId,
            organizationId: instance.organizationId ?? IsNull(),
            projectId: instance.projectId,
            instanceId: instance.id
        })
        .setParameter('held', 'held')
        .getRawOne()
    return totalsSchema.parse(row)
}

@Injectable()
export class ProjectPipelineModelBudgetStore {
    constructor(private readonly db: DataSource) {}

    async admit(input: PipelineModelBudgetCall): Promise<boolean> {
        callSchema.parse(input)
        const call = input
        const result = await this.db.transaction(async (manager) => {
            const work = await resolvePipelineModelWork(manager, call)
            if (!work) return false
            const context = { projectId: work.record.projectId, actor: call.actor }
            await lockManagedProject(manager, context)
            const scope = projectionScope(context)
            const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
                ...scope,
                id: work.record.instanceId
            })
            if (!instance.nativeModelBudget) return false
            const budget = projectPipelineNativeModelBudgetSchema.parse(instance.nativeModelBudget)
            await assertPipelineModelWorkOpen(manager, instance, work)
            const origin = pipelineModelReservationOrigin(work)
            const previous = await manager.findOne(ProjectPipelineModelReservationEntity, {
                withDeleted: true,
                where: { ...scope, operationId: origin.operationId, requestId: call.requestId }
            })
            // Repeated callback delivery must never authorize a second inference with a reused request ID.
            if (previous) throw pipelineProjectionConflict('MODEL_BUDGET_REQUEST_REPLAY')
            const totals = await pipelineModelBudgetTotals(manager, instance)
            if (totals.calls >= budget.maxCalls || totals.tokens + budget.reservationTokens > budget.maxTokens) {
                await recordPipelineModelBudgetDenial(manager, context, instance, pipelineModelDenialOperation(work))
                return 'budget_exceeded' as const
            }
            await manager.save(ProjectPipelineModelReservationEntity, {
                ...managedAudit(context),
                instanceId: instance.id,
                ...origin,
                executionId: call.executionId,
                requestId: call.requestId,
                state: 'held',
                reservedTokens: String(budget.reservationTokens),
                actualTokens: null
            })
            return true
        })
        if (result === 'budget_exceeded')
            throw new ConflictException({
                message: t('server-ai:Error.ProjectPipelineNativeModelBudgetExceeded'),
                code: 'MODEL_BUDGET_EXCEEDED'
            })
        return result
    }

    async settle(input: PipelineModelBudgetCall & { actualTokens: number }): Promise<void> {
        const { actualTokens, ...rawCall } = input
        callSchema.parse(rawCall)
        const call = rawCall,
            actual = z.number().int().positive().safe().parse(actualTokens)
        await this.db.transaction(async (manager) => {
            const work = await resolvePipelineModelWork(manager, call)
            if (!work) throw pipelineProjectionConflict('MODEL_BUDGET_RESERVATION_MISSING')
            const context = { projectId: work.record.projectId, actor: call.actor }
            await lockManagedProject(manager, context)
            const origin = pipelineModelReservationOrigin(work)
            const reservation = await manager.findOne(ProjectPipelineModelReservationEntity, {
                withDeleted: true,
                where: {
                    ...projectionScope(context),
                    operationId: origin.operationId,
                    requestId: call.requestId,
                    executionId: call.executionId
                }
            })
            if (!reservation) throw pipelineProjectionConflict('MODEL_BUDGET_RESERVATION_MISSING')
            if (reservation.state === 'settled') {
                if (Number(reservation.actualTokens) !== actual)
                    throw pipelineProjectionConflict('MODEL_BUDGET_USAGE_IMMUTABLE')
                return
            }
            reservation.state = 'settled'
            reservation.actualTokens = String(actual)
            await manager.save(reservation)
        })
    }
}
