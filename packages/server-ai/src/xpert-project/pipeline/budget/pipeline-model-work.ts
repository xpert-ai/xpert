// Only host-persisted native identities establish budget ownership. Domain correlation is not authority.
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { IsNull, type EntityManager } from 'typeorm'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { ProjectPipelineInstanceEntity, ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { pipelineAssistantIntentSchema } from '../runtime/pipeline-assistant-intent.schema'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import type { PipelineModelBudgetCall } from './pipeline-model-budget.command'

type ModelWork = { kind: 'managed'; record: ProjectPipelineOperationEntity }

export async function resolvePipelineModelWork(
    manager: EntityManager,
    call: PipelineModelBudgetCall
): Promise<ModelWork | null> {
    const scope = { tenantId: call.actor.tenantId, organizationId: call.actor.organizationId ?? IsNull() }
    let executionId: string | null = call.executionId
    const visited = new Set<string>()
    while (executionId) {
        if (visited.has(executionId) || visited.size >= 64)
            throw pipelineProjectionConflict('MODEL_EXECUTION_ANCESTRY_INVALID')
        visited.add(executionId)
        const execution = await manager.findOne(XpertAgentExecution, {
            where: { ...scope, id: executionId },
            select: ['id', 'parentId', 'xpertId']
        })
        if (!execution) return null
        const operation = await manager
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder('operation')
            .withDeleted()
            .addSelect('operation.assistantIntent')
            .where({ ...scope, id: execution.id })
            .getOne()
        if (operation) {
            const intent = pipelineAssistantIntentSchema.parse(operation.assistantIntent)
            if (intent.executionId !== execution.id || operation.context.actor.userId !== call.actor.userId)
                throw pipelineProjectionConflict('MODEL_EXECUTION_SCOPE_MISMATCH')
            return { kind: 'managed', record: operation }
        }
        executionId = execution.parentId ?? null
    }
    return null
}

export function pipelineModelReservationOrigin(work: ModelWork) {
    return { operationId: work.record.id }
}
export function pipelineModelDenialOperation(work: ModelWork) {
    return { id: work.record.id, roundId: work.record.roundId }
}

/** Caller holds the Project lock. Late usage settlement deliberately does not apply this admission gate. */
export async function assertPipelineModelWorkOpen(
    manager: EntityManager,
    instance: ProjectPipelineInstanceEntity,
    work: ModelWork
) {
    const scope = {
        tenantId: instance.tenantId,
        organizationId: instance.organizationId ?? IsNull(),
        projectId: instance.projectId
    }
    const closed = () => {
        throw pipelineProjectionConflict('MODEL_BUDGET_EXECUTION_CLOSED')
    }
    if (instance.authority !== 'platform') closed()
    if (work.kind === 'managed') {
        if (instance.currentRunId !== work.record.runId || instance.currentRoundId !== work.record.roundId) closed()
        const operation = await manager.findOneOrFail(ProjectPipelineOperationEntity, {
            withDeleted: true,
            where: { ...scope, id: work.record.id }
        })
        if (
            operation.deletedAt ||
            operation.cancelRequestedAt ||
            operation.terminalObservedAt ||
            !operation.dispatchStartedAt ||
            !['dispatching', 'pending', 'unknown'].includes(operation.state)
        )
            closed()
        return
    }
}
