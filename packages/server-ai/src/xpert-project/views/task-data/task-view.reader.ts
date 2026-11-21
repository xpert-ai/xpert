import { createHash } from 'node:crypto'
import { instanceToPlain } from 'class-transformer'
import type { ProjectTaskViewQuery } from '@xpert-ai/contracts'
import type { ProjectTaskContext } from '@xpert-ai/plugin-sdk'
import type { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import type { ProjectTaskRuntimeReadService } from '../../runtime/project-task-runtime-read.service'
import { compactTaskAvatars } from '../project-task-avatars'
import { executionSummaryDto, taskIndexDto, taskTimelineBounds } from './task-view.dto'
import { taskArtifactsDto, taskDetailDto } from './task-detail.dto'

/** View transport only; the full domain graph remains available to commands and runtime consumers. */
export async function readTaskView(
    tasks: ProjectTaskGraphService,
    runtime: ProjectTaskRuntimeReadService,
    context: ProjectTaskContext,
    input: ProjectTaskViewQuery
) {
    if (input.resource === 'execution-result') {
        const { taskId, executionId, expectedRevision, offset, limit } = input
        return {
            item: await runtime.readResult(context.projectId, { taskId, executionId, expectedRevision, offset, limit })
        }
    }
    let payload: object
    if (input.resource === 'context') payload = { item: await tasks.viewContext(context) }
    else if (input.resource === 'task-index') {
        const graph = await tasks.viewIndex(context)
        const item = {
            ...graph,
            cursor: '',
            progressive: true,
            timelineBounds: taskTimelineBounds(graph),
            tasks: taskIndexDto(graph),
            executions: []
        }
        payload = input.compactAvatars ? compactTaskAvatars(item, input.avatarVersions) : { item }
    } else if (input.resource === 'executions') {
        const page = await tasks.viewExecutions(context, {
            taskIds: input.taskIds,
            after: input.after,
            limit: input.limit
        })
        payload = { items: page.items.map(executionSummaryDto), next: page.next }
    } else {
        const detail = await runtime.get(context.projectId, input.taskId, input.resource === 'execution-detail', {
            executionId: input.resource === 'task-detail' ? undefined : input.executionId,
            includeDecisions: input.resource === 'execution-detail'
        })
        payload = { item: input.resource === 'execution-artifacts' ? taskArtifactsDto(detail) : taskDetailDto(detail) }
    }
    // Serialize before hashing: entity-only changes cannot invalidate a view representation.
    const plain = instanceToPlain(payload)
    const version = createHash('sha256').update(JSON.stringify(plain)).digest('hex')
    return input.knownVersion === version ? { notModified: true, version } : { ...plain, version }
}
