import { createHash } from 'node:crypto'
import { Exclude, Expose, plainToInstance } from 'class-transformer'
import type { ProjectTaskGraph, ProjectTaskNode } from '@xpert-ai/contracts'
type Execution = ProjectTaskGraph['executions'][number]

@Exclude()
export class ProjectTaskIndexItemDto {
    @Expose() id: ProjectTaskNode['id']
    @Expose() title: ProjectTaskNode['title']
    @Expose() status: ProjectTaskNode['status']
    @Expose() progress: ProjectTaskNode['progress']
    @Expose() kind: ProjectTaskNode['kind']
    @Expose() taskType: ProjectTaskNode['taskType']
    @Expose() presentation: ProjectTaskNode['presentation']
    @Expose() executor: ProjectTaskNode['executor']
    @Expose() parentTaskId: ProjectTaskNode['parentTaskId']
    @Expose() predecessorIds: ProjectTaskNode['predecessorIds']
    @Expose() providerKey: ProjectTaskNode['providerKey']
    @Expose() sourceKey: ProjectTaskNode['sourceKey']
    @Expose() revision: ProjectTaskNode['revision']
    @Expose() plannedStartAt: ProjectTaskNode['plannedStartAt']
    @Expose() plannedEndAt: ProjectTaskNode['plannedEndAt']
    @Expose() estimatedDurationMs: ProjectTaskNode['estimatedDurationMs']
    @Expose() actualStartAt: ProjectTaskNode['actualStartAt']
    @Expose() actualEndAt: ProjectTaskNode['actualEndAt']
    @Expose() diagnostic: ProjectTaskNode['diagnostic']
    @Expose() assigneeXpertId: ProjectTaskNode['assigneeXpertId']
    @Expose() assigneeName: ProjectTaskNode['assigneeName']
    @Expose() assigneeAvatar: ProjectTaskNode['assigneeAvatar']
    @Expose() controlKind: ProjectTaskNode['controlKind']
    @Expose() pipelineInstanceId: ProjectTaskNode['pipelineInstanceId']
    @Expose() pipelineInstanceTitle: ProjectTaskNode['pipelineInstanceTitle']
    @Expose() pipelineDisposition: ProjectTaskNode['pipelineDisposition']
    @Expose() executionCount: number
    @Expose() executionVersion: string
}

@Exclude()
export class ProjectTaskExecutionSummaryDto {
    @Expose() id: Execution['id']
    @Expose() taskId: Execution['taskId']
    @Expose() attempt: Execution['attempt']
    @Expose() status: Execution['status']
    @Expose() invocationId: Execution['invocationId']
    @Expose() invocationStatus: Execution['invocationStatus']
    @Expose() runtimeProvider: Execution['runtimeProvider']
    @Expose() runtimeToolId: Execution['runtimeToolId']
    @Expose() runtimeServiceRef: Execution['runtimeServiceRef']
    @Expose() runtimeStatus: Execution['runtimeStatus']
    @Expose() runtimeStartedAt: Execution['runtimeStartedAt']
    @Expose() runtimeCompletedAt: Execution['runtimeCompletedAt']
    @Expose() agentExecutionId: Execution['agentExecutionId']
    @Expose() startedAt: Execution['startedAt']
    @Expose() completedAt: Execution['completedAt']
    @Expose() executorName: Execution['executorName']
    @Expose() pipelineAttemptKind: Execution['pipelineAttemptKind']
    @Expose() reviewReportAvailable: Execution['reviewReportAvailable']
    @Expose() purposeType?: 'implementation' | 'review'
    @Expose() isRework: boolean
    @Expose() businessResult?: 'rejected'
    @Expose() error?: string
}

export function executionSummaryDto(attempt: Execution) {
    return plainToInstance(
        ProjectTaskExecutionSummaryDto,
        {
            ...attempt,
            purposeType: attempt.purpose?.type,
            isRework: attempt.purpose?.type === 'implementation' && Boolean(attempt.purpose.rework),
            businessResult: attempt.outputSummary === 'rejected' ? 'rejected' : undefined,
            error: attempt.error?.slice(0, 300)
        },
        { excludeExtraneousValues: true }
    )
}
export function taskIndexDto(graph: ProjectTaskGraph) {
    const attempts = new Map<string, Execution[]>()
    for (const attempt of graph.executions) {
        const items = attempts.get(attempt.taskId) ?? []
        items.push(attempt)
        attempts.set(attempt.taskId, items)
    }
    return graph.tasks.map((task) => {
        const items = attempts.get(task.id) ?? []
        return plainToInstance(
            ProjectTaskIndexItemDto,
            {
                ...task,
                executionCount: items.length,
                executionVersion: createHash('sha256')
                    .update(JSON.stringify(items.map(executionSummaryDto)))
                    .digest('hex')
            },
            { excludeExtraneousValues: true }
        )
    })
}

export function taskTimelineBounds(graph: ProjectTaskGraph) {
    const timestamps: number[] = []
    let hasRunning = false
    for (const attempt of graph.executions) {
        const observed = Boolean(attempt.invocationId || attempt.agentExecutionId || attempt.runtimeStatus)
        for (const value of observed
            ? [attempt.runtimeStartedAt, attempt.runtimeCompletedAt]
            : [attempt.startedAt, attempt.completedAt]) {
            if (value) {
                const time = new Date(value).getTime()
                if (Number.isFinite(time)) timestamps.push(time)
            }
        }
        hasRunning ||= (attempt.invocationStatus ?? attempt.runtimeStatus ?? attempt.status) === 'running'
    }
    return {
        startAt: timestamps.length ? new Date(timestamps.reduce((a, b) => Math.min(a, b))).toISOString() : null,
        endAt: timestamps.length ? new Date(timestamps.reduce((a, b) => Math.max(a, b))).toISOString() : null,
        hasRunning
    }
}
