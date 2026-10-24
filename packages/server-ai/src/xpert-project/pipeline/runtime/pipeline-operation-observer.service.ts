import { Injectable } from '@nestjs/common'
import { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelinePolicyReceipt, ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { managedAudit } from './pipeline-transaction'
import { finishPipelineCancellation } from './pipeline-cancellation'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'

/** Receipt, evidence, Task state and the next execution intent commit in the same transaction. */
@Injectable()
export class ProjectPipelineOperationObserverService {
    constructor(private readonly coordinator: ProjectPipelineCoordinatorService) {}

    async apply(
        manager: EntityManager,
        context: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity,
        policy?: ProjectPipelinePolicyReceipt
    ) {
        const scope = projectionScope(context),
            audit = managedAudit(context)
        const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, {
            ...scope,
            id: operation.nodeInstanceId
        })
        const receipt = operation.receipt!,
            completion = operation.completion
        const previous = node.projection.state
        const accepted = operation.state === 'accepted'
        const failed = operation.state === 'failed' || operation.state === 'rejected'
        node.projection = {
            ...node.projection,
            state: {
                ...previous,
                lifecycle: accepted
                    ? 'completed'
                    : operation.state === 'cancelled'
                      ? 'cancelled'
                      : failed
                        ? 'failed'
                        : 'active',
                readiness: failed ? 'blocked' : 'ready',
                runtime:
                    receipt.execution?.status ??
                    (receipt.status === 'unknown'
                        ? 'unknown'
                        : operation.kind !== 'operation'
                          ? 'none'
                          : receipt.status === 'pending'
                            ? 'running'
                            : receipt.status)
            },
            evidence: completion?.status === 'accepted' ? completion.evidence : node.projection.evidence
        }
        await manager.save(node)
        if (policy?.status === 'decided') {
            await manager.insert(ProjectPipelineDecisionEntity, {
                ...audit,
                id: pipelineIdentity(context, 'decision', node.id, String(operation.context.work.generation)),
                roundId: operation.roundId,
                nodeInstanceId: node.id,
                operationId: operation.id,
                kind: 'policy',
                policyRef: operation.handlerRef,
                inputDigest: operation.context.work.inputDigest,
                generation: operation.context.work.generation,
                outcome: policy.outcome,
                evidence: policy.evidence,
                actorId: context.actor.userId
            })
        }
        const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
        for (const taskId of node.taskIds) {
            const attempt = await manager.findOneBy(XpertProjectTaskExecution, {
                ...scope,
                taskId,
                sourceKey: operation.id
            })
            if (attempt) {
                if (receipt.status !== 'unknown')
                    attempt.status = receipt.status === 'pending' ? 'running' : receipt.status
                if (receipt.execution) {
                    Object.assign(attempt, runtimeExecutionUpdate(receipt.execution))
                    const status = receipt.execution.status
                    if (
                        status === 'queued' ||
                        status === 'running' ||
                        status === 'succeeded' ||
                        status === 'failed' ||
                        status === 'cancelled'
                    )
                        attempt.status = status
                }
                if (!attempt.startedAt && operation.dispatchStartedAt) attempt.startedAt = operation.dispatchStartedAt
                if (operation.terminalObservedAt) attempt.completedAt ??= operation.terminalObservedAt
                await manager.save(attempt)
            }
        }
        if (receipt.status !== 'unknown')
            await manager.update(
                ProjectPipelineAttentionEntity,
                { ...scope, nodeInstanceId: node.id, kind: 'unknown', state: 'open' },
                { state: 'resolved' }
            )
        // Even when the DAG does not change, a new observation must invalidate the graph cursor.
        const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
            ...scope,
            id: operation.instanceId
        })
        instance.revision += 1
        await manager.save(instance)
        await manager.insert(ProjectPipelineEventEntity, {
            ...audit,
            id: pipelineIdentity(context, 'event', instance.id, String(instance.revision)),
            instanceId: instance.id,
            revision: instance.revision,
            type: 'operation.observed',
            payload: {
                roundId: operation.roundId,
                operationId: operation.id,
                humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instance.id)
            }
        })
        await this.coordinator.advanceWithinTransaction(manager, context, operation.instanceId)
    }

    async historical(
        manager: EntityManager,
        context: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity
    ) {
        const scope = projectionScope(context)
        const status = operation.receipt?.execution?.status ?? operation.receipt?.status
        if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
            await manager.update(
                XpertProjectTaskExecution,
                { ...scope, sourceKey: operation.id },
                {
                    status,
                    completedAt: operation.terminalObservedAt ?? new Date(),
                    ...runtimeExecutionUpdate(operation.receipt.execution)
                }
            )
            const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, {
                ...scope,
                id: operation.nodeInstanceId
            })
            node.projection = { ...node.projection, state: { ...node.projection.state, runtime: status } }
            await manager.save(node)
            const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, {
                ...scope,
                id: operation.instanceId
            })
            instance.revision += 1
            await manager.save(instance)
            await manager.insert(ProjectPipelineEventEntity, {
                ...managedAudit(context),
                id: pipelineIdentity(context, 'event', instance.id, String(instance.revision)),
                instanceId: instance.id,
                revision: instance.revision,
                type: 'operation.observed',
                payload: {
                    roundId: operation.roundId,
                    operationId: operation.id,
                    humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instance.id)
                }
            })
            await finishPipelineCancellation(manager, context, operation.runId)
            await this.coordinator.advanceWithinTransaction(manager, context, operation.instanceId)
        }
    }
}

function runtimeExecutionUpdate(execution: ProjectPipelineOperationReceipt['execution']) {
    if (!execution) return {}
    return execution.kind === 'assistant_task'
        ? {
              agentExecutionId: execution.executionId,
              conversationId: execution.conversationId,
              xpertId: execution.xpertId
          }
        : { invocationId: execution.invocationId }
}
