// Recovery is an explicit human command. Immutable request/completion events preserve the
// original failure; a short lease fences slow validators and survives a lost HTTP response.
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DataSource, type EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import type {
    ProjectPipelineCompletionReceipt,
    ProjectPipelineOperationAction,
    ProjectPipelineOperationReceipt
} from '@xpert-ai/contracts'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { lockManagedProject, managedAudit } from '../runtime/pipeline-transaction'
import { ProjectPipelineCoordinatorService } from '../runtime/pipeline-coordinator.service'
import { ProjectPipelineOperationObserverService } from '../runtime/pipeline-operation-observer.service'
import { assertPipelineDispatchEnabled } from '../runtime/pipeline-dispatch-policy'
import {
    recoveryEventId,
    recoveryRecordSchema,
    recoveryVersion,
    type PipelineRecoveryRecord
} from './pipeline-recovery-record'
import { assertRecoveryQuiescent } from './pipeline-recovery-runtime'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'

@Injectable()
export class ProjectPipelineRecoveryStore {
    constructor(
        private readonly db: DataSource,
        private readonly coordinator: ProjectPipelineCoordinatorService,
        private readonly observer: ProjectPipelineOperationObserverService
    ) {}

    async operation(c: ProjectPipelineContext, id: string, manager = this.db.manager) {
        return manager
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder('operation')
            .addSelect('operation.assistantIntent')
            .where({ ...projectionScope(c), id })
            .getOneOrFail()
    }

    async current(c: ProjectPipelineContext, row: ProjectPipelineOperationEntity, manager = this.db.manager) {
        const scope = projectionScope(c)
        const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...scope, id: row.instanceId })
        const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: row.runId })
        const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, { ...scope, id: row.roundId })
        const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, { ...scope, id: row.nodeInstanceId })
        const latest = await manager.findOne(ProjectPipelineOperationEntity, {
            where: { ...scope, nodeInstanceId: node.id },
            order: { attempt: 'DESC' }
        })
        if (
            instance.authority !== 'platform' ||
            instance.currentRunId !== row.runId ||
            instance.currentRoundId !== row.roundId ||
            !['active', 'waiting'].includes(run.state) ||
            round.state !== 'active' ||
            node.disposition !== 'active' ||
            round.generation !== row.context.work.generation ||
            round.inputDigest !== row.context.work.inputDigest ||
            latest?.id !== row.id ||
            row.kind !== 'operation' ||
            row.state !== 'failed' ||
            row.receipt?.status !== 'failed' ||
            !row.terminalObservedAt ||
            row.cancelRequestedAt ||
            (row.receipt.control && row.receipt.control.state !== 'settled') ||
            node.projection.state.lifecycle !== 'failed' ||
            node.projection.state.freshness !== 'current'
        )
            throw pipelineProjectionConflict('RECOVERY_STATE_CONFLICT')
        if (
            !run.bindingSnapshot?.limits ||
            Date.now() - run.createdAt.getTime() >= run.bindingSnapshot.limits.runTimeoutMinutes * 60_000
        )
            throw pipelineProjectionConflict('RUN_TIME_LIMIT_EXCEEDED')
        await assertRecoveryQuiescent(manager, c, row)
        const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...scope,
            id: run.definitionId
        })
        if (definition.definition.executionAuthority !== 'platform')
            throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const spec = definition.definition.nodes.find((item) => item.key === node.nodeKey)
        if (spec?.kind !== 'work' || spec.operationRef !== row.handlerRef || spec.completionRef !== row.completionRef)
            throw pipelineProjectionConflict('RECOVERY_STATE_CONFLICT')
        return { instance, run, round, node, spec }
    }

    async request(
        c: ProjectPipelineContext,
        input: ProjectPipelineOperationAction,
        mode: PipelineRecoveryRecord['mode'],
        authorize: () => Promise<void>
    ) {
        return this.db.transaction(async (manager) => {
            await lockManagedProject(manager, c)
            await authorize()
            const row = await this.operation(c, input.operationId, manager)
            if (input.version !== recoveryVersion(row)) throw pipelineProjectionConflict('RECOVERY_STATE_CONFLICT')
            const id = recoveryEventId(c, row.id, mode)
            const completedId = pipelineIdentity(c, 'recovery-completed', id)
            if (await manager.existsBy(ProjectPipelineEventEntity, { ...projectionScope(c), id: completedId }))
                return null
            assertPipelineDispatchEnabled()
            const current = await this.current(c, row, manager)
            const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
            if (row.leaseExpiresAt && row.leaseExpiresAt > now) throw pipelineProjectionConflict('RECOVERY_IN_PROGRESS')
            const record = recoveryRecordSchema.parse({
                mode,
                actorId: c.actor.userId,
                bindingDigest: input.version,
                attempt: mode === 'retry-once' ? row.attempt + 1 : row.attempt,
                previousReceipt: row.receipt,
                previousCompletion: row.completion,
                requestedAt: now.toISOString()
            })
            if (!(await manager.existsBy(ProjectPipelineEventEntity, { ...projectionScope(c), id })))
                await this.event(manager, c, row, id, 'operation.recovery_requested', record)
            if (mode === 'retry-once') {
                current.node.projection = {
                    ...current.node.projection,
                    state: {
                        ...current.node.projection.state,
                        lifecycle: 'pending',
                        readiness: 'ready',
                        runtime: 'none'
                    }
                }
                await manager.save(current.node)
                await this.resolveAttention(manager, c, row)
                await this.coordinator.advanceWithinTransaction(manager, c, row.instanceId)
                await this.event(manager, c, row, completedId, 'operation.recovered', record)
                return null
            }
            row.leaseOwner = randomUUID()
            row.leaseFence += 1
            row.leaseExpiresAt = new Date(now.getTime() + 120_000)
            await manager.save(row)
            return row
        })
    }

    async complete(
        c: ProjectPipelineContext,
        claim: ProjectPipelineOperationEntity,
        receipt: ProjectPipelineOperationReceipt,
        completion: ProjectPipelineCompletionReceipt,
        authorize: () => Promise<void>
    ) {
        return this.db.transaction(async (manager) => {
            await lockManagedProject(manager, c)
            await authorize()
            assertPipelineDispatchEnabled()
            const row = await this.operation(c, claim.id, manager)
            await this.current(c, row, manager)
            const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
            if (
                row.leaseOwner !== claim.leaseOwner ||
                row.leaseFence !== claim.leaseFence ||
                !row.leaseExpiresAt ||
                row.leaseExpiresAt <= now ||
                recoveryVersion(row) !== recoveryVersion(claim)
            )
                throw pipelineProjectionConflict('OPERATION_LEASE_EXPIRED')
            const id = recoveryEventId(c, row.id, 'reconcile-result')
            const request = await manager.findOneByOrFail(ProjectPipelineEventEntity, { ...projectionScope(c), id })
            const record = recoveryRecordSchema.parse(request.payload.recovery)
            if (
                record.bindingDigest !== recoveryVersion(row) ||
                receipt.status !== 'succeeded' ||
                completion.status !== 'accepted'
            )
                throw pipelineProjectionConflict('RECOVERY_RESULT_INVALID')
            row.state = 'accepted'
            row.receipt = receipt
            row.completion = completion
            row.leaseOwner = null
            row.leaseExpiresAt = null
            row.leaseFence += 1
            await manager.save(row)
            await this.resolveAttention(manager, c, row)
            await this.event(
                manager,
                c,
                row,
                pipelineIdentity(c, 'recovery-completed', id),
                'operation.recovered',
                record
            )
            // Native execution and its terminal time remain unchanged. Only domain completion is reconciled.
            await this.observer.apply(manager, c, row)
        })
    }

    async release(c: ProjectPipelineContext, claim: ProjectPipelineOperationEntity) {
        await this.db.manager.update(
            ProjectPipelineOperationEntity,
            {
                ...projectionScope(c),
                id: claim.id,
                state: 'failed',
                leaseOwner: claim.leaseOwner,
                leaseFence: claim.leaseFence
            },
            { leaseOwner: null, leaseExpiresAt: null }
        )
    }
    private resolveAttention(manager: EntityManager, c: ProjectPipelineContext, row: ProjectPipelineOperationEntity) {
        return manager.update(
            ProjectPipelineAttentionEntity,
            { ...projectionScope(c), nodeInstanceId: row.nodeInstanceId, state: 'open' },
            { state: 'resolved' }
        )
    }
    private async event(
        manager: EntityManager,
        c: ProjectPipelineContext,
        row: ProjectPipelineOperationEntity,
        id: string,
        type: 'operation.recovery_requested' | 'operation.recovered',
        recovery: PipelineRecoveryRecord
    ) {
        const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
            ...projectionScope(c),
            id: row.instanceId
        })
        instance.revision += 1
        await manager.save(instance)
        await manager.insert(ProjectPipelineEventEntity, {
            ...managedAudit(c),
            id,
            instanceId: instance.id,
            revision: instance.revision,
            type,
            payload: {
                roundId: row.roundId,
                operationId: row.id,
                recovery,
                humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, c, instance.id)
            }
        })
    }
}
