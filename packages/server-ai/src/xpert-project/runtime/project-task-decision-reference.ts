// References are deterministic observations, not permissions. No cache, grant or database row is minted.
// Rebuild from scoped persistence and retain all legacy decision checks before accepting a candidate.
import { createHash } from 'node:crypto'
import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'
import type { ProjectTaskDecision, ProjectTaskDecisionInput } from '@xpert-ai/contracts'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import type { EntityManager } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { implementationReviews, decisionImplementationTask } from './project-task-review-subtasks'
import { taskSpecification } from './project-task-evidence'

type Actor = Pick<AgentInvocationScope, 'tenantId' | 'organizationId' | 'userId'>
export type DecisionBinding = Pick<
    ProjectTaskDecisionInput,
    | 'taskId'
    | 'expectedRevision'
    | 'implementationExecutionId'
    | 'specificationDigest'
    | 'evidence'
    | 'reviewExecutionId'
> & { reviewResult?: ProjectTaskDecision['reviewResult'] }
type Reason =
    | 'InvalidReference'
    | 'ContextChanged'
    | 'CandidatePending'
    | 'ReviewPending'
    | 'ReportMissing'
    | 'Restricted'
const messages: Record<Reason, string> = {
    InvalidReference: 'Invalid decision reference. Read project_get_task and copy a returned decisionRef unchanged.',
    ContextChanged:
        'The task, candidate or review has changed. Read project_get_task again, reassess its evidence and use the new decisionRef.',
    CandidatePending:
        'The implementation is still executing or its stop is unconfirmed. Wait for its result before deciding.',
    ReviewPending:
        'The selected independent review has not completed successfully. Inspect the review task; do not restart implementation for report delivery alone.',
    ReportMissing:
        'The independent review has no readable report. Inspect the review task and recover its report delivery before deciding.',
    Restricted:
        'The current actor cannot access this execution result. Use an authorized task owner; the reference grants no access.'
}
export class ProjectTaskDecisionReferenceError extends HttpException {
    readonly diagnostic: { code: Reason; message: string; taskId?: string }
    constructor(code: Reason, taskId?: string) {
        const message = t(`server-ai:TaskDecision.${code}`, { defaultValue: messages[code] })
        const diagnostic = { code, message, ...(taskId ? { taskId } : {}) }
        super(`${message} Diagnostic: ${JSON.stringify(diagnostic)}`, code === 'Restricted' ? 403 : 409)
        this.diagnostic = diagnostic
    }
}
export function parseDecisionRef(reference: string) {
    const [version, taskId, implementationExecutionId, digest, extra] = reference.split('/')
    if (
        version !== 'pd1' ||
        extra !== undefined ||
        !z.string().uuid().safeParse(taskId).success ||
        !z.string().uuid().safeParse(implementationExecutionId).success ||
        !/^[a-f0-9]{64}$/.test(digest ?? '')
    )
        throw new ProjectTaskDecisionReferenceError('InvalidReference')
    return { taskId, implementationExecutionId }
}
export function decisionRef(binding: DecisionBinding) {
    const snapshot = {
        taskId: binding.taskId,
        expectedRevision: binding.expectedRevision,
        implementationExecutionId: binding.implementationExecutionId,
        specificationDigest: binding.specificationDigest,
        // Normalize object-key order; JSONB can reorder persisted properties.
        evidence: binding.evidence.map((ref) =>
            ref.type === 'invocation_result'
                ? { type: ref.type, invocationId: ref.invocationId, revision: ref.revision }
                : ref.type === 'artifact'
                  ? { type: ref.type, artifactId: ref.artifactId, versionId: ref.versionId }
                  : { type: ref.type, snapshotId: ref.snapshotId, digest: ref.digest }
        ),
        reviewExecutionId: binding.reviewExecutionId ?? null,
        reviewResult: binding.reviewResult
            ? {
                  invocationId: binding.reviewResult.invocationId,
                  revision: binding.reviewResult.revision,
                  sha256: binding.reviewResult.sha256
              }
            : null
    }
    return `pd1/${binding.taskId}/${binding.implementationExecutionId}/${createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`
}

export async function decisionBinding(
    manager: EntityManager,
    actor: Actor,
    task: XpertProjectTask,
    executionId: string
) {
    const where = { tenantId: actor.tenantId, organizationId: actor.organizationId, projectId: task.projectId }
    const implementation = await decisionImplementationTask(manager, task, actor, executionId, false).catch((error) => {
        // Changed hierarchy/specification must not make task reads fail or invite guessed metadata.
        if (error instanceof HttpException && error.getStatus() === 409)
            throw new ProjectTaskDecisionReferenceError('ContextChanged', task.id)
        throw error
    })
    const attempts = await manager.getRepository(XpertProjectTaskExecution).find({
        where: { ...where, taskId: implementation.id },
        order: { attempt: 'DESC' }
    })
    const attempt = attempts.find((item) => item.purpose?.type !== 'review')
    if (!attempt?.invocationId || attempt.id !== executionId || attempt.purpose?.type !== 'implementation')
        throw new ProjectTaskDecisionReferenceError('ContextChanged', task.id)
    const invocation = (
        await manager.getRepository(AgentInvocationEntity).findOneBy({
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            ownerId: actor.userId,
            id: attempt.invocationId
        })
    )?.invocation
    if (!invocation) throw new ProjectTaskDecisionReferenceError('Restricted', task.id)
    if (!invocationCanRelease(invocation)) throw new ProjectTaskDecisionReferenceError('CandidatePending', task.id)
    const specificationDigest = taskSpecification(implementation).digest
    if (specificationDigest !== attempt.specificationSnapshot?.digest)
        throw new ProjectTaskDecisionReferenceError('ContextChanged', task.id)
    const review = (await implementationReviews(manager, implementation, actor)).find(
        (item) => item.purpose?.type === 'review' && item.purpose.implementationExecutionId === attempt.id
    )
    const binding: DecisionBinding = {
        taskId: task.id,
        expectedRevision: task.revision,
        implementationExecutionId: attempt.id,
        specificationDigest,
        evidence: [
            { type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision },
            ...(invocation.result?.artifacts ?? []).flatMap((item) =>
                item.versionId ? [{ type: 'artifact' as const, artifactId: item.id, versionId: item.versionId }] : []
            )
        ]
    }
    if (review) {
        const result =
            review.invocationId &&
            (
                await manager.getRepository(AgentInvocationEntity).findOneBy({
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    ownerId: actor.userId,
                    id: review.invocationId
                })
            )?.invocation
        if (!result) throw new ProjectTaskDecisionReferenceError('Restricted', task.id)
        if (result.status !== 'succeeded' || !invocationCanRelease(result))
            throw new ProjectTaskDecisionReferenceError('ReviewPending', review.taskId)
        if (!result.result?.text?.trim()) throw new ProjectTaskDecisionReferenceError('ReportMissing', review.taskId)
        // Preserve the exact evidence selection reviewed; never append the review's own artifacts.
        if (review.purpose?.type !== 'review') throw new ProjectTaskDecisionReferenceError('ContextChanged', task.id)
        if (
            !review.purpose.evidence.some(
                (ref) =>
                    ref.type === 'invocation_result' &&
                    ref.invocationId === invocation.id &&
                    ref.revision === invocation.revision
            )
        )
            throw new ProjectTaskDecisionReferenceError('ContextChanged', task.id)
        binding.evidence = review.purpose.evidence
        binding.reviewExecutionId = review.id
        binding.reviewResult = {
            invocationId: result.id,
            revision: result.revision,
            sha256: createHash('sha256').update(result.result.text).digest('hex')
        }
    }
    return { binding, implementationTaskId: implementation.id, reviewTaskId: review?.taskId }
}

/** Read only current direct candidates, without launching or inspecting child runtimes. */
export async function taskDecisionOptions(manager: EntityManager, actor: Actor, task: XpertProjectTask) {
    if (task.reviewSubject) return []
    const candidates =
        task.kind === 'summary'
            ? await manager.getRepository(XpertProjectTask).find({
                  where: {
                      tenantId: actor.tenantId,
                      organizationId: actor.organizationId,
                      projectId: task.projectId,
                      parentTaskId: task.id,
                      kind: 'task'
                  },
                  relations: ['executions']
              })
            : [task]
    const options = []
    for (const child of candidates.filter((item) => !item.reviewSubject)) {
        const attempt = [...(child.executions ?? [])]
            .sort((a, b) => b.attempt - a.attempt)
            .find((item) => item.purpose?.type !== 'review')
        if (!attempt || attempt.purpose?.type !== 'implementation') continue
        try {
            const result = await decisionBinding(manager, actor, task, attempt.id)
            options.push({
                taskId: task.id,
                implementationTaskId: result.implementationTaskId,
                implementationExecutionId: attempt.id,
                reviewTaskId: result.reviewTaskId,
                reviewExecutionId: result.binding.reviewExecutionId,
                decisionRef: decisionRef(result.binding)
            })
        } catch (error) {
            if (!(error instanceof ProjectTaskDecisionReferenceError)) throw error
            options.push({ taskId: task.id, implementationTaskId: child.id, diagnostic: error.diagnostic })
        }
    }
    return options
}
