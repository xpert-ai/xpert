// Invariants: a full snapshot owns one instance, not every task from its provider.
// All mutations use the caller's transaction; absence requires an explicit tombstone.
import { EntityManager } from 'typeorm'
import type { ProjectPipelineProjection } from '@xpert-ai/contracts'
import type {
    IProjectPipelineProjectionProvider,
    ProjectPipelineContext,
    ProjectTaskSnapshot
} from '@xpert-ai/plugin-sdk'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { projectTaskIdentity } from '../../services/project-task-identity'
import { projectionScope, writeTaskProjection } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineNodeEntity, ProjectPipelineTaskLinkEntity } from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from './pipeline-projection.errors'
import { pipelineTaskDisposition } from '../queries/pipeline-task-disposition'

export const pipelineTaskSourceKey = (instanceId: string, taskKey: string) => JSON.stringify([instanceId, taskKey])

export async function writePipelineTasksAndNodes(
    manager: EntityManager,
    context: ProjectPipelineContext,
    provider: IProjectPipelineProjectionProvider,
    instanceId: string,
    roundId: string,
    snapshot: ProjectPipelineProjection
) {
    const scope = projectionScope(context)
    const existingTasks = await manager.find(XpertProjectTask, { where: { ...scope, pipelineInstanceId: instanceId } })
    const scopedKey = (key: string) => pipelineTaskSourceKey(instanceId, key)
    const activeKeys = new Set(snapshot.tasks.map((task) => scopedKey(task.key)))
    const tombstones = new Map(snapshot.taskTombstones.map((item) => [scopedKey(item.key), item.reason]))
    if (
        existingTasks.some(
            (task) =>
                task.pipelineDisposition === 'active' &&
                !activeKeys.has(task.sourceKey) &&
                !tombstones.has(task.sourceKey)
        )
    ) {
        throw pipelineProjectionConflict('TASK_TOMBSTONE_REQUIRED')
    }
    for (const key of tombstones.keys()) {
        if (!existingTasks.some((task) => task.sourceKey === key))
            throw pipelineProjectionConflict('TASK_TOMBSTONE_UNKNOWN')
    }
    const attempts = await manager.find(XpertProjectTaskExecution, { where: scope })
    for (const task of snapshot.tasks) {
        const taskId = projectTaskIdentity(context.projectId, provider.key, scopedKey(task.key))
        for (const attempt of task.executions) {
            const previous = attempts.find((row) => row.id === projectTaskIdentity(taskId, provider.key, attempt.key))
            if (!previous) continue
            if (
                previous.attempt !== attempt.attempt ||
                (['invocationId', 'agentExecutionId', 'conversationId', 'threadId', 'xpertId'] as const).some((key) => {
                    return previous[key] && attempt[key] && previous[key] !== attempt[key]
                })
            )
                throw pipelineProjectionConflict('ATTEMPT_IDENTITY_IMMUTABLE')
            if (['succeeded', 'failed', 'cancelled'].includes(previous.status) && previous.status !== attempt.status)
                throw pipelineProjectionConflict('ATTEMPT_TERMINAL_IMMUTABLE')
        }
    }
    const taskSnapshot: ProjectTaskSnapshot = {
        revision: String(snapshot.sourceSequence),
        tasks: snapshot.tasks.map((task) => ({
            ...task,
            key: scopedKey(task.key),
            title: task.title,
            status: task.status,
            kind: task.kind,
            predecessorKeys: task.predecessorKeys.map(scopedKey),
            parentKey: task.parentKey ? scopedKey(task.parentKey) : undefined,
            executions: task.executions.map((attempt) => ({
                ...attempt,
                key: attempt.key,
                attempt: attempt.attempt,
                status: attempt.status
            }))
        }))
    }
    const rawLinks = await writeTaskProjection(manager, context, provider, taskSnapshot, {
        pipelineInstanceId: instanceId
    })
    const links = snapshot.tasks.map((task) => ({
        sourceKey: task.key,
        taskId: rawLinks.find((link) => link.sourceKey === scopedKey(task.key))!.taskId
    }))
    for (const link of links) {
        const owners = snapshot.nodes.filter((node) => node.taskKeys.includes(link.sourceKey))
        const disposition = pipelineTaskDisposition(owners)
        if (disposition !== 'active')
            await manager.update(XpertProjectTask, { ...scope, id: link.taskId }, { pipelineDisposition: disposition })
    }
    for (const task of existingTasks) {
        const reason = tombstones.get(task.sourceKey)
        if (reason && task.pipelineDisposition !== reason) {
            task.pipelineDisposition = reason
            // Business status and all execution attempts remain intact.
            await manager.save(task)
        }
    }
    const previousNodes = await manager.find(ProjectPipelineNodeEntity, { where: { ...scope, roundId } })
    const nodeKeys = new Set(snapshot.nodes.map((node) => node.key))
    const nodeTombstones = new Map(snapshot.nodeTombstones.map((item) => [item.key, item.reason]))
    if (
        previousNodes.some(
            (node) =>
                node.disposition === 'active' && !nodeKeys.has(node.sourceKey) && !nodeTombstones.has(node.sourceKey)
        )
    ) {
        throw pipelineProjectionConflict('NODE_TOMBSTONE_REQUIRED')
    }
    for (const key of nodeTombstones.keys()) {
        if (!previousNodes.some((node) => node.sourceKey === key))
            throw pipelineProjectionConflict('NODE_TOMBSTONE_UNKNOWN')
    }
    const audit = {
        tenantId: context.actor.tenantId,
        organizationId: context.actor.organizationId ?? null,
        projectId: context.projectId,
        createdById: context.actor.userId
    }
    for (const node of snapshot.nodes) {
        const id = pipelineIdentity(context, 'node', roundId, node.nodeKey, node.expansionKey)
        const previous = previousNodes.find((item) => item.sourceKey === node.key)
        if (previous && (previous.id !== id || previous.disposition !== 'active'))
            throw pipelineProjectionConflict('NODE_IDENTITY_CHANGED')
        const taskIds = [...new Set(node.taskKeys.map((key) => links.find((link) => link.sourceKey === key)!.taskId))]
        await manager.save(
            ProjectPipelineNodeEntity,
            manager.create(ProjectPipelineNodeEntity, {
                ...previous,
                ...audit,
                id,
                roundId,
                sourceKey: node.key,
                nodeKey: node.nodeKey,
                expansionKey: node.expansionKey,
                disposition: 'active',
                projection: node,
                taskIds
            })
        )
        await manager.delete(ProjectPipelineTaskLinkEntity, { ...scope, nodeInstanceId: id })
        for (const taskId of taskIds) {
            await manager.insert(ProjectPipelineTaskLinkEntity, {
                ...audit,
                id: pipelineIdentity(context, 'task-link', id, taskId),
                nodeInstanceId: id,
                taskId,
                relation: 'primary'
            })
        }
    }
    for (const node of previousNodes) {
        const reason = nodeTombstones.get(node.sourceKey)
        if (reason && node.disposition !== reason) {
            node.disposition = reason
            await manager.save(node)
        }
    }
    return links
}
