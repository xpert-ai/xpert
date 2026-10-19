import { assertPipelineDispatchEnabled } from './pipeline-dispatch-policy'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import {
    projectPipelineCancelSchema,
    projectPipelineRetrySchema,
    type ProjectPipelineCancel,
    type ProjectPipelineRetry
} from '@xpert-ai/contracts'
import { ProjectPipelineContributionRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { finishPipelineCancellation } from './pipeline-cancellation'
import { lockManagedProject, managedAudit } from './pipeline-transaction'
import { pipelineRetryReason } from './pipeline-retry'
import { sealPipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'

/** Version-bound user commands. They only write intents; workers own all external effects. */
@Injectable()
export class ProjectPipelineLifecycleService {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly catalog: ProjectPipelineContributionRegistry,
        private readonly coordinator: ProjectPipelineCoordinatorService
    ) {}

    async cancel(context: ProjectPipelineContext, request: ProjectPipelineCancel) {
        const input = projectPipelineCancelSchema.parse(request)
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        return this.instances.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const { instance, run, round, replay } = await this.command(manager, context, 'cancel', input)
            if (replay) return this.receipt(instance)
            if (!['active', 'pending', 'waiting', 'cancelling'].includes(run.state))
                throw pipelineProjectionConflict('RUN_STATE_CONFLICT')
            run.state = 'cancelling'
            await manager.save(run)
            const scope = projectionScope(context)
            const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
            const operations = await manager.find(ProjectPipelineOperationEntity, {
                where: {
                    ...scope,
                    runId: run.id,
                    state: In(['queued', 'dispatching', 'pending', 'unknown', 'succeeded'])
                }
            })
            for (const operation of operations) {
                operation.cancelRequestedAt ??= now
                operation.nextCheckAt = now
                if (!operation.dispatchStartedAt || operation.terminalObservedAt) {
                    operation.state = operation.terminalObservedAt ? 'superseded' : 'cancelled'
                    operation.leaseFence += 1
                    operation.leaseOwner = null
                    operation.leaseExpiresAt = null
                    if (!operation.dispatchStartedAt) {
                        operation.receipt = { status: 'cancelled', receiptKey: operation.id }
                        operation.terminalObservedAt = now
                        await manager.update(
                            XpertProjectTaskExecution,
                            { ...scope, sourceKey: operation.id },
                            { status: 'cancelled', completedAt: now }
                        )
                    }
                }
                await manager.save(operation)
            }
            const nodes = await manager.find(ProjectPipelineNodeEntity, { where: { ...scope, roundId: round.id } })
            for (const node of nodes) {
                if (['completed', 'failed'].includes(node.projection.state.lifecycle)) continue
                const inFlight = operations.some(
                    (operation) =>
                        operation.nodeInstanceId === node.id && !['cancelled', 'superseded'].includes(operation.state)
                )
                node.projection = {
                    ...node.projection,
                    state: {
                        ...node.projection.state,
                        readiness: 'blocked',
                        lifecycle: inFlight ? 'active' : 'cancelled',
                        runtime: inFlight
                            ? 'cancelling'
                            : node.projection.state.runtime === 'queued'
                              ? 'cancelled'
                              : node.projection.state.runtime
                    }
                }
                await manager.save(node)
                if (node.taskIds.length)
                    await manager.update(
                        XpertProjectTask,
                        { ...scope, id: In(node.taskIds) },
                        { status: inFlight ? 'blocked' : 'cancelled' }
                    )
            }
            await manager.update(
                ProjectPipelineAttentionEntity,
                { ...scope, instanceId: instance.id, kind: 'human', state: 'open' },
                { state: 'superseded' }
            )
            await sealPipelineHumanWaitSnapshot(manager, context, pipelineIdentity(context, 'command', input.requestId))
            await finishPipelineCancellation(manager, context, run.id)
            return this.receipt(
                await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...scope, id: instance.id })
            )
        })
    }

    async retry(context: ProjectPipelineContext, request: ProjectPipelineRetry) {
        const input = projectPipelineRetrySchema.parse(request)
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        return this.instances.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const { instance, run, round, replay } = await this.command(manager, context, 'retry', input)
            if (replay) return this.receipt(instance)
            assertPipelineDispatchEnabled()
            const scope = projectionScope(context)
            if (
                !['active', 'waiting'].includes(run.state) ||
                round.state !== 'active' ||
                round.inputDigest !== input.inputDigest ||
                round.generation !== input.generation
            )
                throw pipelineProjectionConflict('OPERATION_GENERATION_SUPERSEDED')
            const operation = await manager.findOneByOrFail(ProjectPipelineOperationEntity, {
                ...scope,
                id: input.operationId,
                roundId: round.id
            })
            const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, {
                ...scope,
                id: operation.nodeInstanceId
            })
            const descriptor = this.catalog
                .listForActor(context.actor)
                .flatMap((item) => item.descriptors)
                .find((item) => item.kind === 'operation' && item.ref === operation.handlerRef)
            const attempts = await manager.count(ProjectPipelineOperationEntity, {
                where: { ...scope, nodeInstanceId: node.id }
            })
            const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
            const reason = pipelineRetryReason(operation, node, run, descriptor, attempts, now)
            if (reason) throw pipelineProjectionConflict(reason)
            node.projection = {
                ...node.projection,
                state: { ...node.projection.state, lifecycle: 'pending', readiness: 'ready', runtime: 'none' }
            }
            await manager.save(node)
            await manager.update(
                ProjectPipelineAttentionEntity,
                { ...scope, nodeInstanceId: node.id, state: 'open' },
                { state: 'resolved' }
            )
            await sealPipelineHumanWaitSnapshot(manager, context, pipelineIdentity(context, 'command', input.requestId))
            await this.coordinator.advanceWithinTransaction(manager, context, instance.id)
            return this.receipt(
                await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...scope, id: instance.id })
            )
        })
    }

    private async command(
        manager: EntityManager,
        context: ProjectPipelineContext,
        kind: 'cancel' | 'retry',
        input: ProjectPipelineCancel | ProjectPipelineRetry
    ) {
        const scope = projectionScope(context)
        const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
            ...scope,
            id: input.instanceId
        })
        if (instance.authority !== 'platform') throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const id = pipelineIdentity(context, 'command', input.requestId)
        const digest = pipelineDigest({ ...input, kind, actorId: context.actor.userId })
        const event = await manager.findOneBy(ProjectPipelineEventEntity, { ...scope, id })
        if (event && (event.instanceId !== instance.id || event.payload.digest !== digest))
            throw pipelineProjectionConflict('COMMAND_INPUT_IMMUTABLE')
        const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: instance.currentRunId })
        const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, {
            ...scope,
            id: instance.currentRoundId
        })
        if (!event) {
            if (instance.revision !== input.expectedRevision) throw pipelineProjectionConflict('RUN_REVISION_CONFLICT')
            instance.revision += 1
            await manager.save(instance)
            await manager.insert(ProjectPipelineEventEntity, {
                ...managedAudit(context),
                id,
                instanceId: instance.id,
                revision: instance.revision,
                type: `run.${kind}_requested`,
                payload: { digest, runId: run.id, roundId: round.id }
            })
        }
        return { instance, run, round, replay: !!event }
    }
    private receipt(instance: ProjectPipelineInstanceEntity) {
        return {
            instanceId: instance.id,
            runId: instance.currentRunId,
            roundId: instance.currentRoundId,
            revision: instance.revision
        }
    }
}
