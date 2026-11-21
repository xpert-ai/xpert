import type { FindOptionsSelect } from 'typeorm'
import type { XpertProjectTask } from '../../entities/project-task.entity'
import type { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'

export const taskViewTaskColumns: FindOptionsSelect<XpertProjectTask> = {
    id: true,
    name: true,
    title: true,
    status: true,
    progress: true,
    kind: true,
    type: true,
    controlKind: true,
    pipelineInstanceId: true,
    pipelineDisposition: true,
    parentTaskId: true,
    predecessorIds: true,
    providerKey: true,
    sourceKey: true,
    revision: true,
    plannedStartAt: true,
    plannedEndAt: true,
    estimatedDurationMs: true,
    diagnostic: true,
    assigneeXpertId: true,
    reviewSubject: true
}
// Purpose is needed for exact candidate/report matching; the transport DTO exposes only its classification.
export const taskViewExecutionColumns: FindOptionsSelect<XpertProjectTaskExecution> = {
    id: true,
    taskId: true,
    projectId: true,
    invocationId: true,
    dispatchState: true,
    sourceKey: true,
    purpose: true,
    attempt: true,
    status: true,
    agentExecutionId: true,
    xpertId: true,
    startedAt: true,
    completedAt: true,
    outputSummary: true,
    error: true
}
