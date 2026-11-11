// Invariants: hierarchy is presentation, never evidence authority. A review child pins
// one implementation; a summary can accept only its own current child candidate.
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { projectTaskReviewSubjectSchema, type ProjectTaskExecutionPurpose } from '@xpert-ai/contracts'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { EntityManager, In } from 'typeorm'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { assertOrdinaryTask } from '../services/project-task-ownership'
import { taskSpecification } from './project-task-evidence'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

type Actor = Pick<AgentInvocationScope, 'tenantId' | 'organizationId' | 'userId'>
type Review = Extract<ProjectTaskExecutionPurpose, { type?: 'review' }>
const scope = (task: XpertProjectTask, actor: Actor) => ({
    projectId: task.projectId, tenantId: actor.tenantId, organizationId: actor.organizationId
})

export async function coordinationContext(manager: EntityManager, task: XpertProjectTask, actor: Actor, requireActive = true) {
    if (!task.parentTaskId) return undefined
    const parent = await manager.getRepository(XpertProjectTask).findOne({
        where: { ...scope(task, actor), id: task.parentTaskId }, relations: ['steps']
    })
    if (!parent) throw projectTaskRuntimeError('Evidence')
    if (parent.kind !== 'summary') return undefined
    assertOrdinaryTask(parent)
    if (requireActive && !['todo', 'in_progress', 'review', 'blocked'].includes(parent.status)) throw projectTaskRuntimeError('State')
    return { taskId: parent.id, specificationDigest: taskSpecification(parent).digest }
}

export async function decisionImplementationTask(
    manager: EntityManager, owner: XpertProjectTask, actor: Actor, executionId: string, requireCompletedSiblings = true
) {
    if (owner.reviewSubject) throw projectTaskRuntimeError('State')
    if (owner.kind !== 'summary') return owner
    const attempt = await manager.getRepository(XpertProjectTaskExecution).findOneBy({
        ...scope(owner, actor), id: executionId, createdById: actor.userId
    })
    const child = attempt && await manager.getRepository(XpertProjectTask).findOne({
        where: { ...scope(owner, actor), id: attempt.taskId }, relations: ['steps']
    })
    if (!child || child.parentTaskId !== owner.id || child.kind !== 'task' || child.reviewSubject ||
        attempt.purpose?.type !== 'implementation' || attempt.purpose.coordination?.taskId !== owner.id ||
        attempt.purpose.coordination.specificationDigest !== taskSpecification(owner).digest)
        throw projectTaskRuntimeError('Evidence')
    assertOrdinaryTask(child)
    const siblings = await manager.getRepository(XpertProjectTask).find({
        where: { ...scope(owner, actor), parentTaskId: owner.id }
    })
    if (requireCompletedSiblings && siblings.some((item) => item.id !== child.id && !item.reviewSubject && !['done', 'completed'].includes(item.status)))
        throw projectTaskRuntimeError('Dependencies')
    return child
}

export async function reviewImplementationTask(
    manager: EntityManager, reviewTask: XpertProjectTask, actor: Actor, purpose: Review
) {
    if (!purpose.implementationTaskId) {
        if (reviewTask.reviewSubject) throw projectTaskRuntimeError('Evidence')
        return reviewTask // Historical same-task reviews.
    }
    const subject = projectTaskReviewSubjectSchema.safeParse(reviewTask.reviewSubject)
    if (!subject.success || subject.data.implementationTaskId !== purpose.implementationTaskId ||
        subject.data.implementationExecutionId !== purpose.implementationExecutionId ||
        subject.data.specificationDigest !== purpose.specificationDigest) throw projectTaskRuntimeError('Evidence')
    const implementation = await manager.getRepository(XpertProjectTask).findOne({
        where: { ...scope(reviewTask, actor), id: subject.data.implementationTaskId }, relations: ['steps']
    })
    if (!implementation || implementation.reviewSubject || implementation.kind !== 'task' ||
        reviewTask.parentTaskId !== (implementation.parentTaskId ?? implementation.id))
        throw projectTaskRuntimeError('Evidence')
    assertOrdinaryTask(implementation)
    await coordinationContext(manager, implementation, actor, false)
    return implementation
}

/** Caller holds the project lock. Same candidate retries reuse the work item. */
export async function ensureReviewSubtask(
    manager: EntityManager, implementation: XpertProjectTask, actor: Actor, purpose: Review
) {
    if (implementation.reviewSubject || implementation.kind !== 'task') throw projectTaskRuntimeError('State')
    await coordinationContext(manager, implementation, actor)
    const tasks = manager.getRepository(XpertProjectTask)
    const parentTaskId = implementation.parentTaskId ?? implementation.id
    const siblings = await tasks.find({ where: { ...scope(implementation, actor), parentTaskId } })
    const reviewSubject = projectTaskReviewSubjectSchema.parse({
        implementationTaskId: implementation.id, implementationExecutionId: purpose.implementationExecutionId,
        specificationDigest: purpose.specificationDigest
    })
    const existing = siblings.find((item) => item.reviewSubject?.implementationTaskId === implementation.id &&
        item.reviewSubject.implementationExecutionId === purpose.implementationExecutionId)
    if (existing) {
        assertOrdinaryTask(existing)
        if (existing.reviewSubject.specificationDigest !== purpose.specificationDigest || existing.status === 'cancelled')
            throw projectTaskRuntimeError('Conflict')
        return existing
    }
    const title = t('server-ai:ProjectTask.IndependentReview', { title: implementation.title || implementation.name })
    return tasks.save(tasks.create({
        ...scope(implementation, actor), id: randomUUID(), createdById: actor.userId,
        name: title, title, kind: 'task', controlKind: 'ordinary', status: 'todo', revision: 1,
        parentTaskId, reviewSubject, assigneeXpertId: implementation.assigneeXpertId,
        requirements: ['Independently assess the pinned candidate and deliver reproducible findings. A negative verdict completes the review, not the delivery.'],
        predecessorIds: [], decisions: [], steps: []
    }))
}

export async function implementationReviews(manager: EntityManager, task: XpertProjectTask, actor: Actor) {
    const children = await manager.getRepository(XpertProjectTask).find({
        where: { ...scope(task, actor), parentTaskId: task.parentTaskId ?? task.id }
    })
    const ids = [task.id, ...children.filter((child) => child.reviewSubject?.implementationTaskId === task.id).map((child) => child.id)]
    const attempts = await manager.getRepository(XpertProjectTaskExecution).find({
        where: { ...scope(task, actor), taskId: In(ids) }, order: { createdAt: 'DESC', attempt: 'DESC' }
    })
    return attempts.filter((attempt) => attempt.purpose?.type === 'review')
}
