import type { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineConfiguration } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { XpertProjectTask } from '../../entities/project-task.entity'
import {
    ProjectPipelineNodeEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineTaskLinkEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { initialPipelineNodeState, type ManagedPipelineDefinition } from './pipeline-round-planner'

export async function initializeManagedPipelineNodes(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instanceId: string,
    roundId: string,
    template: ManagedPipelineDefinition,
    binding: ProjectPipelineConfiguration['binding']
) {
    const audit = {
        projectId: context.projectId,
        tenantId: context.actor.tenantId,
        organizationId: context.actor.organizationId ?? null,
        createdById: context.actor.userId
    }
    for (const [order, spec] of template.nodes.entries()) {
        const id = pipelineIdentity(context, 'node', roundId, spec.key, 'root')
        const hasTask = ['work', 'human_gate', 'external_wait'].includes(spec.kind)
        const taskId = pipelineIdentity(context, 'managed-task', id)
        const executor = spec.kind === 'work' ? binding.executorBindings?.[spec.executorSlot] : undefined
        const assigneeXpertId = executor?.kind === 'assistant' ? z.string().uuid().parse(executor.selectionKey) : null
        if (hasTask)
            await manager.insert(XpertProjectTask, {
                ...audit,
                id: taskId,
                name: spec.label ?? spec.key,
                title: spec.label ?? spec.key,
                assigneeXpertId,
                kind: 'task',
                type: `pipeline.${spec.kind}`,
                status: 'todo',
                order,
                controlKind: 'pipeline',
                pipelineInstanceId: instanceId,
                pipelineDisposition: 'active',
                sourceKey: id,
                providerKey: 'platform.pipeline@1'
            })
        await manager.insert(ProjectPipelineNodeEntity, {
            ...audit,
            id,
            roundId,
            nodeKey: spec.key,
            sourceKey: spec.key,
            expansionKey: 'root',
            disposition: 'active',
            taskIds: hasTask ? [taskId] : [],
            projection: {
                key: spec.key,
                nodeKey: spec.key,
                expansionKey: 'root',
                title: spec.label ?? spec.key,
                kind: spec.kind,
                laneKey: 'laneKey' in spec ? spec.laneKey : null,
                stageKey: spec.stageKey,
                state: initialPipelineNodeState(),
                taskKeys: hasTask ? [id] : [],
                evidence: []
            }
        })
        if (hasTask)
            await manager.insert(ProjectPipelineTaskLinkEntity, {
                ...audit,
                id: pipelineIdentity(context, 'task-link', id, taskId),
                nodeInstanceId: id,
                taskId,
                relation: 'primary'
            })
    }
    await manager.update(ProjectPipelineRoundEntity, roundId, {
        edges: template.edges.map((edge) => ({
            ...edge,
            key: JSON.stringify([edge.from, edge.to, edge.outcome ?? null]),
            selection: 'undetermined'
        }))
    })
}
