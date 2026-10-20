import { In, type EntityManager } from 'typeorm'
import { projectPipelineProjectionNodeSchema, type ProjectPipelineProjectionNode } from '@xpert-ai/contracts'
import type { ProjectTaskContext } from '@xpert-ai/plugin-sdk'
import type { XpertProjectTask } from '../../entities/project-task.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineTaskLinkEntity
} from '../persistence/pipeline.entity'

export function pipelineTaskDisposition(
    owners: readonly ProjectPipelineProjectionNode[]
): XpertProjectTask['pipelineDisposition'] {
    // A shared task remains current while any owner can still select it; business status is independent.
    return owners.length && owners.every((node) => node.state.freshness === 'superseded')
        ? 'superseded'
        : owners.length && owners.every((node) => node.state.applicability === 'excluded')
          ? 'excluded'
          : 'active'
}

/** Older stored tasks may lack selection metadata. Read the exact current projection without rewriting history. */
export async function pipelineTaskDispositions(
    manager: EntityManager,
    context: ProjectTaskContext,
    tasks: readonly XpertProjectTask[]
) {
    const result = new Map<string, XpertProjectTask['pipelineDisposition']>()
    const candidates = tasks.filter(
        (task) =>
            task.pipelineInstanceId &&
            task.pipelineDisposition !== 'removed' &&
            task.pipelineDisposition !== 'superseded'
    )
    if (!candidates.length) return result
    const scope = projectionScope(context)
    const instances = await manager.find(ProjectPipelineInstanceEntity, {
        where: { ...scope, id: In([...new Set(candidates.map((task) => task.pipelineInstanceId))]) }
    })
    const roundIds = instances.flatMap((instance) => (instance.currentRoundId ? [instance.currentRoundId] : []))
    if (!roundIds.length) return result
    const nodes = await manager.find(ProjectPipelineNodeEntity, {
        where: { ...scope, roundId: In(roundIds), disposition: 'active' }
    })
    if (!nodes.length) return result
    const links = await manager.find(ProjectPipelineTaskLinkEntity, {
        where: {
            ...scope,
            taskId: In(candidates.map((task) => task.id)),
            nodeInstanceId: In(nodes.map((node) => node.id)),
            relation: 'primary'
        }
    })
    const projections = new Map(
        nodes.map((node) => [node.id, projectPipelineProjectionNodeSchema.parse(node.projection)])
    )
    for (const task of candidates) {
        const instance = instances.find((instance) => instance.id === task.pipelineInstanceId)
        const owners = nodes.filter(
            (node) =>
                node.roundId === instance?.currentRoundId &&
                node.taskIds.includes(task.id) &&
                links.some((link) => link.taskId === task.id && link.nodeInstanceId === node.id)
        )
        if (owners.length) result.set(task.id, pipelineTaskDisposition(owners.map((node) => projections.get(node.id)!)))
    }
    return result
}
