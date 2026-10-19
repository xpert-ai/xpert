// Capacity belongs to durable work, not a worker lease. Unknown effects retain
// their slot until a confirmed terminal observation; recovery must remain runnable.
import { z } from 'zod/v3'
import type { EntityManager } from 'typeorm'
import { projectPipelineBindingSchema, projectPipelineDefinitionSchema } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'

const limit = z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.number().int().max(100_000))
    .optional()
const policySchema = z.object({ global: limit, tenant: limit, assistant: limit }).strict()
export function pipelineAdmissionPolicy(env: NodeJS.ProcessEnv = process.env) {
    return policySchema.parse({
        global: env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS,
        tenant: env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_TENANT,
        assistant: env.XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_ASSISTANT
    })
}

export type PipelineAdmissionReason = 'GLOBAL_CAPACITY' | 'TENANT_CAPACITY' | 'ASSISTANT_CAPACITY'

/** Call only for a first execute claim, inside the Project-locked transaction. */
export async function pipelineAdmissionBlock(
    manager: EntityManager,
    context: ProjectPipelineContext,
    operation: ProjectPipelineOperationEntity
): Promise<PipelineAdmissionReason | null> {
    const policy = pipelineAdmissionPolicy()
    if (operation.kind !== 'operation' || !Object.values(policy).some((value) => value !== undefined)) return null
    if (!manager.queryRunner?.isTransactionActive) throw Error('PIPELINE_ADMISSION_REQUIRES_TRANSACTION')
    // Shared across all API/Worker processes using this database. No external call holds this lock.
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['xpert.pipeline.admission.v1'])
    const active = () =>
        manager
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder('operation')
            .withDeleted()
            .where('operation.kind = :kind', { kind: 'operation' })
            .andWhere('operation.state IN (:...states)', { states: ['dispatching', 'pending', 'unknown'] })
            .andWhere('operation."terminalObservedAt" IS NULL')
            .andWhere('operation.id <> :id', { id: operation.id })
    if (policy.global !== undefined && (await active().getCount()) >= policy.global) return 'GLOBAL_CAPACITY'
    if (
        policy.tenant !== undefined &&
        (await active()
            .andWhere('operation."tenantId" = :tenantId', { tenantId: context.actor.tenantId })
            .getCount()) >= policy.tenant
    )
        return 'TENANT_CAPACITY'
    if (policy.assistant === undefined) return null

    const scope = projectionScope(context)
    const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: operation.runId })
    const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, { ...scope, id: operation.nodeInstanceId })
    const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
        ...scope,
        id: run.definitionId
    })
    const template = projectPipelineDefinitionSchema.parse(definition.definition)
    if (template.executionAuthority !== 'platform') throw Error('PLATFORM_AUTHORITY_REQUIRED')
    const spec = template.nodes.find((item) => item.key === node.nodeKey)
    const binding = projectPipelineBindingSchema.parse(run.bindingSnapshot)
    const executor = spec?.kind === 'work' ? binding.executorBindings?.[spec.executorSlot] : undefined
    if (executor?.kind !== 'assistant') return null

    // Resolve the exact immutable executor slot, including claimed work that has not
    // prepared its native intent yet. Labels, current Project bindings and parent Agents are irrelevant.
    const count = await active()
        .innerJoin(
            ProjectPipelineRunEntity,
            'run',
            'run.id = operation."runId" AND run."tenantId" = operation."tenantId" AND run."projectId" = operation."projectId"'
        )
        .innerJoin(
            ProjectPipelineNodeEntity,
            'node',
            'node.id = operation."nodeInstanceId" AND node."roundId" = operation."roundId"'
        )
        .innerJoin(ProjectPipelineDefinitionEntity, 'definition', 'definition.id = run."definitionId"')
        .andWhere('operation."tenantId" = :tenantId', { tenantId: context.actor.tenantId })
        .andWhere(
            `EXISTS (SELECT 1 FROM jsonb_array_elements(definition.definition->'nodes') spec
            WHERE spec->>'kind' = 'work' AND spec->>'key' = node."nodeKey"
            AND run."bindingSnapshot"->'executorBindings'->(spec->>'executorSlot')->>'kind' = 'assistant'
            AND run."bindingSnapshot"->'executorBindings'->(spec->>'executorSlot')->>'selectionKey' = :assistantId)`,
            { assistantId: executor.selectionKey }
        )
        .getCount()
    return count >= policy.assistant ? 'ASSISTANT_CAPACITY' : null
}
