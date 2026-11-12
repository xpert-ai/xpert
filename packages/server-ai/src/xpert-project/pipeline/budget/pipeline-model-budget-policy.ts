// Invariants: the base policy is immutable across Runs. Human increases are append-only audit events;
// effective limits never erase calls, actual usage or unresolved reservations.
import {
    projectPipelineModelBudgetIncreaseRecordSchema,
    projectPipelineNativeModelBudgetSchema
} from '@xpert-ai/contracts'
import { IsNull, type EntityManager } from 'typeorm'
import { ProjectPipelineEventEntity, ProjectPipelineInstanceEntity } from '../persistence/pipeline.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

export async function pipelineModelBudgetPolicy(manager: EntityManager, instance: ProjectPipelineInstanceEntity) {
    const basePolicy = projectPipelineNativeModelBudgetSchema.parse(instance.nativeModelBudget)
    const events = await manager.find(ProjectPipelineEventEntity, {
        withDeleted: true,
        where: {
            tenantId: instance.tenantId,
            organizationId: instance.organizationId ?? IsNull(),
            projectId: instance.projectId,
            instanceId: instance.id,
            type: 'model.budget_increased'
        },
        order: { revision: 'ASC' }
    })
    let maxTokens = basePolicy.maxTokens
    const increases = events.map((event) => {
        const record = projectPipelineModelBudgetIncreaseRecordSchema.parse(event.payload.budgetIncrease)
        if (
            record.previousMaxTokens !== maxTokens ||
            record.maxTokens <= maxTokens ||
            event.revision > instance.revision
        )
            throw pipelineProjectionConflict('MODEL_BUDGET_AUDIT_INVALID')
        maxTokens = record.maxTokens
        return {
            ...record,
            eventId: event.id,
            revision: event.revision,
            actorId: event.createdById,
            createdAt: event.createdAt
        }
    })
    return { basePolicy, policy: { ...basePolicy, maxTokens }, increases }
}
