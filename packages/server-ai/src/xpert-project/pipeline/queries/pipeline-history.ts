import { z } from 'zod/v3'
import { projectPipelineTaskProjectionSchema, type ProjectTaskGraph } from '@xpert-ai/contracts'
import { projectTaskIdentity } from '../../services/project-task-identity'
import { pipelineTaskSourceKey } from '../projection/pipeline-projection.writer'

/** Provider Tasks retain logical identity across rounds; their old values must come from the saved projection. */
export function providerHistoryTasks(
    projectId: string,
    instanceId: string,
    providerKey: string,
    cursor: string,
    value: unknown
): ProjectTaskGraph {
    const snapshot = z.array(projectPipelineTaskProjectionSchema).parse(value)
    const id = (key: string) => projectTaskIdentity(projectId, providerKey, pipelineTaskSourceKey(instanceId, key))
    return {
        projectId,
        cursor,
        canEditPlan: false,
        diagnostics: [],
        tasks: snapshot.map((task) => ({
            id: id(task.key),
            title: task.title,
            status: task.status,
            progress: task.progress,
            kind: task.kind,
            taskType: task.taskType,
            parentTaskId: task.parentKey ? id(task.parentKey) : null,
            predecessorIds: task.predecessorKeys.map(id),
            providerKey,
            sourceKey: pipelineTaskSourceKey(instanceId, task.key),
            controlKind: 'provider',
            pipelineInstanceId: instanceId,
            pipelineDisposition: 'superseded',
            revision: 0,
            plannedStartAt: null,
            plannedEndAt: null,
            estimatedDurationMs: null,
            actualStartAt: null,
            actualEndAt: null,
            diagnostic: task.diagnostic ?? null,
            assigneeXpertId: task.assigneeXpertId ?? null
        })),
        executions: snapshot.flatMap((task) =>
            task.executions.map((execution) => ({
                ...execution,
                status: execution.status,
                attempt: execution.attempt,
                id: projectTaskIdentity(id(task.key), providerKey, execution.key),
                taskId: id(task.key),
                sourceKey: execution.key,
                startedAt: execution.startedAt ? new Date(execution.startedAt) : undefined,
                completedAt: execution.completedAt ? new Date(execution.completedAt) : undefined,
                // Provider snapshots store task acceptance timestamps, not frozen native runtime observations.
                runtimeStatus: 'unknown',
                runtimeStartedAt: null,
                runtimeCompletedAt: null
            }))
        )
    }
}

/** Keep historical task fields frozen while observing the original round's executions at read time.
 * Attribution must run afterwards: task membership alone cannot establish a round.
 */
export function observeHistoricalPipelineTasks(
    snapshot: ProjectTaskGraph,
    observed: ProjectTaskGraph
): ProjectTaskGraph {
    const taskIds = new Set(snapshot.tasks.map((task) => task.id))
    return {
        ...snapshot,
        cursor: `${snapshot.cursor}:${observed.cursor}`,
        executions: [
            ...new Map(
                [...snapshot.executions, ...observed.executions.filter((attempt) => taskIds.has(attempt.taskId))].map(
                    (attempt) => [attempt.id, attempt]
                )
            ).values()
        ]
    }
}
