// Invariants: normalize only a confirmed, owned review bound to the exact task and dispatch.
// Text-only reports have no stable finding IDs; never invent IDs for feedback-linked rework.
import type { ProjectTaskExecutionReviewReport } from '@xpert-ai/contracts'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import type { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { XpertProjectTask } from '../entities/project-task.entity'
import type { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { reviewImplementationTask } from './project-task-review-subtasks'
import { reviewReport } from './project-task-evidence'

/** Internal feedback projection; report versions and execution-specific fields stay at the reader boundary. */
export type ProjectTaskReviewFeedback = Pick<
    ProjectTaskExecutionReviewReport, 'verdict' | 'findings' | 'checks' | 'limitations'
> & { reviewExecutionId: string }

/** Read under the caller's project lock; database failures must not become an empty feedback history. */
export async function readProjectTaskReviewFeedback(
    manager: EntityManager, task: XpertProjectTask, scope: AgentInvocationScope, review: XpertProjectTaskExecution
): Promise<ProjectTaskReviewFeedback | null> {
    if (!review.invocationId || review.purpose?.type !== 'review' || review.createdById !== scope.userId) return null
    const where = { tenantId: scope.tenantId, organizationId: scope.organizationId }
    const reviewTask = await manager.getRepository(XpertProjectTask).findOne({
        where: { ...where, projectId: task.projectId, id: review.taskId }, relations: ['steps']
    })
    if (!reviewTask || reviewTask.status === 'cancelled' ||
        (await reviewImplementationTask(manager, reviewTask, scope, review.purpose)).id !== task.id) return null
    const row = await manager.getRepository(AgentInvocationEntity).findOneBy({
        ...where, id: review.invocationId, ownerId: scope.userId
    })
    const reference = row?.invocation.request.dispatch?.projectTask
    if (!row || row.invocation.scope.projectId !== task.projectId || row.invocation.status !== 'succeeded' ||
        !invocationCanRelease(row.invocation) || reference?.projectId !== task.projectId ||
        reference.projectTaskId !== review.taskId || reference.taskExecutionId !== review.id ||
        !sameInvocationData(reference.purpose, review.purpose)) return null
    const report = reviewReport(review.purpose, row.invocation.result?.text)
    // Keep report-format support here; domain consumers only receive validated, addressable findings.
    if (report?.version !== 2) return null
    return { reviewExecutionId: review.id, verdict: report.verdict, findings: report.findings,
        checks: report.checks, limitations: report.limitations }
}
