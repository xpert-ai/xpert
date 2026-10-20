// Invariants: this writer only uses the supplied transaction manager. Provider callbacks run outside it.
import { createHash } from 'node:crypto'
import { EntityManager, IsNull } from 'typeorm'
import { t } from 'i18next'
import { validateProjectTaskGraph, type ProjectTaskNode } from '@xpert-ai/contracts'
import type { IProjectTaskProvider, ProjectTaskContext, ProjectTaskSnapshot } from '@xpert-ai/plugin-sdk'
import { XpertProjectTask, XpertProjectTaskExecution } from '../../../core/entities/internal'
import { projectTaskIdentity } from '../project-task-identity'
import { registeredProjectTaskTypes, invalidProjectTaskType } from '../project-task-types'
import { assertProjectTaskProgress } from '../project-task-progress'

export function projectionScope(context: ProjectTaskContext) {
    return {
        projectId: context.projectId,
        tenantId: context.actor.tenantId,
        organizationId: context.actor.organizationId ?? IsNull()
    }
}

export async function writeTaskProjection(
    manager: EntityManager,
    context: ProjectTaskContext,
    provider: Pick<IProjectTaskProvider, 'key' | 'taskTypes'>,
    snapshot: ProjectTaskSnapshot,
    options?: { pipelineInstanceId: string }
) {
    const taskTypes = registeredProjectTaskTypes(provider)
    const identity = (key: string) => projectTaskIdentity(context.projectId, provider.key, key)
    const existing = await manager.find(XpertProjectTask, {
        where: {
            ...projectionScope(context),
            providerKey: provider.key,
            pipelineInstanceId: options?.pipelineInstanceId ?? IsNull()
        }
    })
    const nodes: ProjectTaskNode[] = snapshot.tasks.map((item) => ({
        id: identity(item.key),
        title: item.title,
        status: item.status,
        progress: item.progress ?? null,
        kind: item.kind,
        taskType: item.taskType ?? null,
        parentTaskId: item.parentKey ? identity(item.parentKey) : null,
        predecessorIds: item.predecessorKeys.map(identity),
        providerKey: provider.key,
        sourceKey: item.key,
        revision: 0,
        plannedStartAt: null,
        plannedEndAt: null,
        estimatedDurationMs: null,
        actualStartAt: null,
        actualEndAt: null,
        diagnostic: item.diagnostic ?? null,
        assigneeXpertId: item.assigneeXpertId ?? null
    }))
    validateProjectTaskGraph(nodes)
    for (const item of snapshot.tasks) {
        assertProjectTaskProgress(item.progress)
        if (!item.key.trim() || !item.title.trim()) throw Error('PROJECT_TASK_SOURCE_INVALID')
        if (item.taskType != null && !taskTypes.has(item.taskType)) throw invalidProjectTaskType()
        if (new Set(item.executions.map((execution) => execution.key)).size !== item.executions.length)
            throw Error('PROJECT_TASK_ATTEMPT_DUPLICATE')
        for (const execution of item.executions) {
            if (!execution.key.trim() || !Number.isInteger(execution.attempt) || execution.attempt < 1)
                throw Error('PROJECT_TASK_ATTEMPT_INVALID')
            for (const date of [execution.startedAt, execution.completedAt]) {
                if (date && !Number.isFinite(Date.parse(date))) throw Error('PROJECT_TASK_EXECUTION_DATE_INVALID')
            }
        }
    }
    for (const [index, item] of snapshot.tasks.entries()) {
        const node = nodes[index]
        const sourceRevision = createHash('sha256').update(JSON.stringify(item)).digest('hex')
        const old = existing.find((task) => task.id === node.id)
        if (old?.sourceRevision === sourceRevision && (!options || old.pipelineDisposition === 'active')) continue
        const row =
            old ??
            manager.create(XpertProjectTask, {
                id: node.id,
                projectId: context.projectId,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId,
                createdById: context.actor.userId,
                steps: []
            })
        Object.assign(row, {
            name: item.title,
            title: item.title,
            status: item.status,
            ...(item.progress !== undefined ? { progress: item.progress } : {}),
            kind: item.kind,
            ...(item.taskType !== undefined ? { type: item.taskType } : {}),
            providerKey: provider.key,
            controlKind: 'provider',
            pipelineInstanceId: options?.pipelineInstanceId ?? null,
            pipelineDisposition: options ? 'active' : null,
            sourceKey: item.key,
            sourceRevision,
            parentTaskId: node.parentTaskId,
            predecessorIds: node.predecessorIds,
            diagnostic: node.diagnostic,
            assigneeXpertId: item.assigneeXpertId ?? null
        })
        await manager.save(row)
        for (const execution of item.executions) {
            const executionId = projectTaskIdentity(node.id, provider.key, execution.key)
            const previous = await manager.findOneBy(XpertProjectTaskExecution, {
                id: executionId,
                ...projectionScope(context)
            })
            await manager.save(
                XpertProjectTaskExecution,
                manager.create(XpertProjectTaskExecution, {
                    ...previous,
                    id: executionId,
                    ...execution,
                    sourceKey: execution.key,
                    taskId: node.id,
                    projectId: context.projectId,
                    tenantId: context.actor.tenantId,
                    organizationId: context.actor.organizationId,
                    createdById: context.actor.userId,
                    // Pipeline observations may omit timing; absence cannot erase an observed fact.
                    // Keep the legacy Task provider's replacement semantics outside pipeline projection.
                    startedAt: execution.startedAt
                        ? new Date(execution.startedAt)
                        : options
                          ? (previous?.startedAt ?? null)
                          : null,
                    completedAt: execution.completedAt
                        ? new Date(execution.completedAt)
                        : options
                          ? (previous?.completedAt ?? null)
                          : null
                })
            )
        }
    }
    for (const removed of existing.filter((row) => !nodes.some((node) => node.id === row.id))) {
        if (options) continue
        if (removed.status === 'cancelled') continue
        removed.status = 'cancelled'
        removed.sourceRevision = null
        removed.diagnostic = t('server-ai:Error.ProjectTaskRemovedFromPlan')
        await manager.save(removed)
    }
    return nodes.map((node) => ({ sourceKey: node.sourceKey!, taskId: node.id }))
}
