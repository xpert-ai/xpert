// Denials commit before the model callback throws. One immutable event belongs to one exact operation.
import type { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
    ProjectPipelineEventEntity,
    type ProjectPipelineInstanceEntity,
    type ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { managedAudit } from '../runtime/pipeline-transaction'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

const denied = 'model.admission_denied'
const payloadSchema = z.object({ operationId: z.string().uuid(), roundId: z.string().uuid() })
export async function readPipelineModelBudgetDenial(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operationId: string
) {
    const event = await manager.findOneBy(ProjectPipelineEventEntity, {
        ...projectionScope(context),
        id: pipelineIdentity(context, denied, operationId),
        type: denied
    })
    if (!event) return null
    const payload = payloadSchema.parse(event.payload)
    if (payload.operationId !== operationId) throw pipelineProjectionConflict('MODEL_DENIAL_IDENTITY_INVALID')
    return 'MODEL_BUDGET_EXCEEDED' as const
}

/** Caller holds the Project transaction lock. Never create a synthetic charged model call for a denial. */
export async function recordPipelineModelBudgetDenial(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instance: ProjectPipelineInstanceEntity,
    operation: Pick<ProjectPipelineOperationEntity, 'id' | 'roundId'>
) {
    if (await readPipelineModelBudgetDenial(manager, context, operation.id)) return
    instance.revision += 1
    await manager.save(instance)
    await manager.insert(ProjectPipelineEventEntity, {
        ...managedAudit(context),
        id: pipelineIdentity(context, denied, operation.id),
        instanceId: instance.id,
        revision: instance.revision,
        type: denied,
        payload: {
            operationId: operation.id,
            roundId: operation.roundId,
            humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instance.id)
        }
    })
}
