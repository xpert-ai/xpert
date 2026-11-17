// Denials commit before the callback throws. Repeated denials coalesce until another admission.
// A later admitted request resolves the observation; prior events and usage remain immutable.
// Project-locked revisions order new events: PostgreSQL createdAt is the transaction start, not the write order.
import type { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
    ProjectPipelineEventEntity,
    ProjectPipelineModelReservationEntity,
    type ProjectPipelineInstanceEntity,
    type ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { managedAudit } from '../runtime/pipeline-transaction'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

const denied = 'model.admission_denied'
const resumed = 'model.admission_resumed'
const payloadSchema = z.object({
    operationId: z.string().uuid(),
    roundId: z.string().uuid(),
    modelAdmissionVersion: z.literal(1).optional()
})
export async function readPipelineModelBudgetDenial(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operationId: string
) {
    return (await activeDenial(manager, context, operationId)) ? ('MODEL_BUDGET_EXCEEDED' as const) : null
}

/** Caller holds the Project transaction lock. Never create a synthetic charged model call for a denial. */
export async function recordPipelineModelBudgetDenial(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instance: ProjectPipelineInstanceEntity,
    operation: Pick<ProjectPipelineOperationEntity, 'id' | 'roundId'>
) {
    if (await readPipelineModelBudgetDenial(manager, context, operation.id)) return
    await recordAdmissionEvent(manager, context, instance, operation, denied)
}

/** Called after saving a real reservation in the same Project-locked transaction; ordinary admissions add no event. */
export async function recordPipelineModelBudgetResumption(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instance: ProjectPipelineInstanceEntity,
    operation: Pick<ProjectPipelineOperationEntity, 'id' | 'roundId'>
) {
    const event = await latestAdmissionEvent(manager, context, operation.id, instance.id)
    // Also seal legacy denials, regardless of their timestamp-based interpretation.
    if (event?.type === denied) await recordAdmissionEvent(manager, context, instance, operation, resumed)
}

async function recordAdmissionEvent(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instance: ProjectPipelineInstanceEntity,
    operation: Pick<ProjectPipelineOperationEntity, 'id' | 'roundId'>,
    type: typeof denied | typeof resumed
) {
    instance.revision += 1
    await manager.save(instance)
    await manager.insert(ProjectPipelineEventEntity, {
        ...managedAudit(context),
        id: pipelineIdentity(context, type, operation.id, String(instance.revision)),
        instanceId: instance.id,
        revision: instance.revision,
        type,
        payload: {
            operationId: operation.id,
            roundId: operation.roundId,
            modelAdmissionVersion: 1,
            humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instance.id)
        }
    })
}

async function latestAdmission(manager: EntityManager, context: ProjectPipelineContext, operationId: string) {
    return manager.findOne(ProjectPipelineModelReservationEntity, {
        where: { ...projectionScope(context), operationId },
        order: { createdAt: 'DESC', id: 'DESC' },
        withDeleted: true
    })
}

async function latestAdmissionEvent(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operationId: string,
    instanceId?: string
) {
    const event = await manager
        .getRepository(ProjectPipelineEventEntity)
        .createQueryBuilder('event')
        .where({ ...projectionScope(context), ...(instanceId ? { instanceId } : {}) })
        .andWhere('event.type IN (:...types)', { types: [denied, resumed] })
        .andWhere("event.payload ->> 'operationId' = :operationId", { operationId })
        .orderBy('event.revision', 'DESC')
        .getOne()
    if (event && payloadSchema.parse(event.payload).operationId !== operationId)
        throw pipelineProjectionConflict('MODEL_DENIAL_IDENTITY_INVALID')
    return event
}

async function activeDenial(manager: EntityManager, context: ProjectPipelineContext, operationId: string) {
    const event = await latestAdmissionEvent(manager, context, operationId)
    if (!event || event.type !== denied) return null
    if (event.payload.modelAdmissionVersion === 1) return event
    // Old records have no explicit resumption event. Preserve their interpretation until the next real admission.
    const admitted = await latestAdmission(manager, context, operationId)
    return admitted && admitted.createdAt >= event.createdAt ? null : event
}

/** Read-only current-operation diagnostics, including denials in resumed coordination turns. */
export async function pipelineModelBudgetDenials(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operations: ProjectPipelineOperationEntity[]
) {
    const observations = await Promise.all(
        operations.map(async (operation) => {
            const event = await activeDenial(manager, context, operation.id)
            if (!event) return null
            const admitted = await latestAdmission(manager, context, operation.id)
            return { event, operation, executionId: admitted?.executionId ?? null }
        })
    )
    return observations.filter((item): item is NonNullable<typeof item> => item !== null)
}
