// Invariants: feedback comes from a confirmed review of the decision's exact candidate.
// Failed retries keep that feedback chain; historical findings never accept a new implementation.
import { projectTaskDecisionSchema, type ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import type { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import type { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { implementationReviews } from './project-task-review-subtasks'
import { readProjectTaskReviewFeedback, type ProjectTaskReviewFeedback } from './project-task-review-feedback'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

export type ProjectTaskReworkContext = ProjectTaskReviewFeedback & { decision: string; feedback: string }
export type ProjectTaskPriorReviewContext = ProjectTaskReviewFeedback & { feedback?: string }

/** Select validated history under the project lock; it is not a verdict on the new candidate. */
export async function projectTaskPriorReviewContext(
    manager: EntityManager,
    task: XpertProjectTask,
    scope: AgentInvocationScope,
    implementation: XpertProjectTaskExecution
): Promise<ProjectTaskPriorReviewContext | null> {
    const purpose = implementation.purpose
    if (purpose?.type !== 'implementation') return null
    const review = (await implementationReviews(manager, task, scope)).find(
        (attempt) =>
            attempt.purpose?.type === 'review' &&
            (purpose.rework
                ? attempt.id === purpose.rework.reviewExecutionId
                : attempt.purpose.implementationExecutionId === implementation.id)
    )
    const feedback = review && (await readProjectTaskReviewFeedback(manager, task, scope, review))
    if (!feedback) return null
    return { ...feedback, feedback: purpose.rework?.feedback }
}

/** Validate the rework chain under the project lock and return its pinned Markdown report. */
export async function projectTaskReworkContext(
    manager: EntityManager,
    task: XpertProjectTask,
    scope: AgentInvocationScope,
    purpose: Extract<ProjectTaskExecutionPurpose, { type?: 'implementation' }>
): Promise<ProjectTaskReworkContext | null> {
    if (!purpose.rework) return null
    const decision = (task.decisions ?? []).map((item) => projectTaskDecisionSchema.parse(item)).at(-1)
    if (decision?.outcome !== 'rework' || decision.reviewExecutionId !== purpose.rework.reviewExecutionId)
        throw projectTaskRuntimeError('ReviewFeedback')
    const review = (await implementationReviews(manager, task, scope)).find(
        (item) => item.id === decision.reviewExecutionId
    )
    if (
        !review ||
        review.purpose?.type !== 'review' ||
        review.purpose.implementationExecutionId !== decision.implementationExecutionId ||
        review.purpose.specificationDigest !== decision.specificationDigest ||
        !sameInvocationData(review.purpose.evidence, decision.evidence)
    )
        throw projectTaskRuntimeError('ReviewFeedback')
    const feedback = await readProjectTaskReviewFeedback(manager, task, scope, review)
    if (
        !feedback ||
        !decision.reviewResult ||
        decision.reviewResult.invocationId !== feedback.invocationId ||
        decision.reviewResult.revision !== feedback.revision ||
        decision.reviewResult.sha256 !== feedback.reportDigest
    )
        throw projectTaskRuntimeError('ReviewFeedback')
    const previous = (
        await manager.getRepository(XpertProjectTaskExecution).find({
            where: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                projectId: task.projectId,
                taskId: task.id
            },
            order: { attempt: 'DESC' }
        })
    ).find((attempt) => attempt.purpose?.type === 'implementation')
    if (previous?.id !== decision.implementationExecutionId) {
        // A failed retry may keep the decision's feedback only after its owned work has really stopped.
        const priorRun =
            previous?.invocationId &&
            (await manager.getRepository(AgentInvocationEntity).findOneBy({
                id: previous.invocationId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                ownerId: scope.userId
            }))
        const reference = priorRun?.invocation.request.dispatch?.projectTask
        if (
            previous?.purpose?.type !== 'implementation' ||
            previous.purpose.rework?.reviewExecutionId !== decision.reviewExecutionId ||
            !priorRun ||
            !['failed', 'cancelled'].includes(priorRun.invocation.status) ||
            !invocationCanRelease(priorRun.invocation) ||
            priorRun.invocation.scope.projectId !== task.projectId ||
            reference?.projectId !== task.projectId ||
            reference.projectTaskId !== task.id ||
            reference.taskExecutionId !== previous.id ||
            !sameInvocationData(reference.purpose, previous.purpose)
        )
            throw projectTaskRuntimeError('ReviewFeedback')
    }
    return { ...feedback, decision: decision.rationale, feedback: purpose.rework.feedback }
}
