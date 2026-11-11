// Invariants: only the responsible caller or an authorized human can decide business completion.
// A decision, its evidence and the task CAS commit together; retries return the original decision.
// Runtime inspection runs before the project lock; persisted revisions are rechecked under that lock.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
    ProjectTaskDecisionInput,
    projectTaskDecisionInputSchema,
    projectTaskDecisionSchema
} from '@xpert-ai/contracts'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { assertOrdinaryTask } from '../services/project-task-ownership'
import { ProjectTaskCaller } from './project-task-dispatch.schema'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { coordinationContext, decisionImplementationTask, implementationReviews, reviewImplementationTask } from './project-task-review-subtasks'
import { implementationEvidence, reviewReport } from './project-task-evidence'
import { diagnoseReviewReport } from './project-task-review-report-diagnostic'
import { projectTaskRuntimeError } from './project-task-runtime.errors'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'

@Injectable()
export class ProjectTaskDecisionService {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: XpertProjectAccessService,
        private readonly context: ProjectTaskRuntimeContextService,
        private readonly factory: AgentInvocationFactoryService
    ) {}

    /**
     * Record an authorized acceptance or rework decision together with the task status change.
     * Runtime inspection may reconcile execution state, so it runs before acquiring the Project lock.
     * The transaction then reloads and validates the task, evidence and inspected invocation revisions;
     * a revision mismatch rejects the decision instead of accepting a stale inspection result.
     * Reusing requestId returns the recorded decision only for the same actor, actor type and input.
     * A child decision does not finish its summary. A summary decision validates the pinned child
     * and commits both histories atomically; acceptance additionally requires completed siblings.
     */
    async decide(projectId: string, input: ProjectTaskDecisionInput, caller?: ProjectTaskCaller) {
        const actor = this.context.actor()
        // Even a replay must satisfy current project access and caller authorization.
        await this.access.assertCanEdit(projectId)
        const scope = caller ? await this.context.resolve(projectId, caller) : null
        const previousTask = await this.tasks.findOneBy({
            id: input.taskId, projectId, tenantId: actor.tenantId, organizationId: actor.organizationId
        })
        if (!previousTask) throw projectTaskRuntimeError('NotFound')
        assertOrdinaryTask(previousTask)
        const previousDecision = previousTask.decisions?.map((item) => projectTaskDecisionSchema.parse(item))
            .find((item) => item.requestId === input.requestId)
        // A committed request needs neither another inspection nor another Project lock.
        // Reject requestId reuse with a different actor or payload rather than treating it as a retry.
        if (previousDecision) {
            if (previousDecision.actorId !== actor.userId || previousDecision.actorType !== (caller?.type ?? 'user') ||
                !sameInvocationData(projectTaskDecisionInputSchema.strip().parse(previousDecision), input))
                throw projectTaskRuntimeError('Conflict')
            return previousDecision
        }
        // Inspect outside the transaction: runtime reconciliation can wait on other services or DB work.
        // Keep the returned revisions, not the rows read before inspect(), which may already be stale.
        const inspected = new Map<string, number>()
        for (const id of [input.implementationExecutionId, input.reviewExecutionId].filter(Boolean)) {
            // Check persisted ownership and caller scope before contacting the captured runtime.
            // The transaction below still validates task/evidence associations against freshly read rows.
            const attempt = await this.tasks.manager.getRepository(XpertProjectTaskExecution).findOneBy({
                id, projectId, tenantId: actor.tenantId, organizationId: actor.organizationId
            })
            if (!attempt?.invocationId) throw projectTaskRuntimeError('Evidence')
            const row = await this.tasks.manager.getRepository(AgentInvocationEntity).findOneBy({
                id: attempt.invocationId, tenantId: actor.tenantId, organizationId: actor.organizationId, ownerId: actor.userId
            })
            if (!row || row.invocation.scope.projectId !== projectId) throw projectTaskRuntimeError('Evidence')
            if (id === input.implementationExecutionId && scope &&
                (scope.conversationId !== row.invocation.scope.conversationId || scope.callerAgentKey !== row.invocation.scope.callerAgentKey ||
                    scope.callerXpertId !== row.invocation.scope.callerXpertId || scope.callerType !== row.invocation.scope.callerType))
                throw projectTaskRuntimeError('Scope')
            const observed = await this.factory.createCapturedApi(row.invocation.scope).inspect(row.id)
            inspected.set(row.id, observed.revision)
            if (input.outcome === 'accept' && attempt.purpose?.type === 'review' && attempt.purpose.mode === 'execution') {
                // Avoid environment I/O for an unfinished, malformed or already failing review.
                // Runtime owns candidate verification; Project rechecks the same revision under its lock below.
                if (observed.status !== 'succeeded' || !invocationCanRelease(observed)) throw projectTaskRuntimeError('State')
                const report = reviewReport(attempt.purpose, observed.result?.text)
                if (!report)
                    throw projectTaskRuntimeError('ReviewReport', diagnoseReviewReport(attempt.purpose, observed.result?.text))
                if (report.verdict !== 'pass') throw projectTaskRuntimeError('Evidence')
                if (!(await this.factory.verifyExecutionReview(row.invocation.scope, row.id)))
                    throw projectTaskRuntimeError('ReviewCandidateChanged')
            }
        }
        // Only persisted-state validation and the atomic decision/status write belong under the lock.
        return this.tasks.manager.transaction(async (manager) => {
            const where = { tenantId: actor.tenantId, organizationId: actor.organizationId }
            await manager
                .getRepository(XpertProject)
                .findOneOrFail({ where: { ...where, id: projectId }, lock: { mode: 'pessimistic_write' } })
            const task = await manager.getRepository(XpertProjectTask).findOne({
                where: { ...where, projectId, id: input.taskId },
                relations: ['steps'],
                lock: undefined
            })
            if (!task) throw projectTaskRuntimeError('NotFound')
            assertOrdinaryTask(task)
            const decisions = (task.decisions ?? []).map((item) => projectTaskDecisionSchema.parse(item))
            const existing = decisions.find((item) => item.requestId === input.requestId)
            // Another request may have committed this decision while inspection was in flight.
            // Replay it before checking expectedRevision, since that commit advanced the task revision.
            if (existing) {
                if (
                    existing.actorId !== actor.userId ||
                    existing.actorType !== (caller?.type ?? 'user') ||
                    !sameInvocationData(projectTaskDecisionInputSchema.strip().parse(existing), input)
                )
                    throw projectTaskRuntimeError('Conflict')
                return existing
            }
            if (task.revision !== input.expectedRevision || !['review', 'blocked', 'in_progress', ...(task.kind === 'summary' ? ['todo'] : [])].includes(task.status))
                throw projectTaskRuntimeError('Conflict')
            const implementation = await decisionImplementationTask(manager, task, actor, input.implementationExecutionId, input.outcome === 'accept')
            const { latest, invocation } = await implementationEvidence(
                manager,
                implementation,
                actor,
                input.implementationExecutionId,
                input.specificationDigest,
                input.evidence
            )
            if (
                scope &&
                (scope.conversationId !== invocation.scope.conversationId ||
                    scope.callerAgentKey !== invocation.scope.callerAgentKey ||
                    scope.callerXpertId !== invocation.scope.callerXpertId ||
                    scope.callerType !== invocation.scope.callerType)
            )
                throw projectTaskRuntimeError('Scope')
            // Inspection does not lock an invocation; reject a different revision on the transactional read.
            if (inspected.get(invocation.id) !== invocation.revision) throw projectTaskRuntimeError('Conflict')
            if (!invocationCanRelease(invocation) || (input.outcome === 'accept' && invocation.status !== 'succeeded'))
                throw projectTaskRuntimeError('State')
            // Children can be accepted independently without accepting their summary. Recheck the
            // host-pinned parent so reparenting or changed parent requirements cannot reuse old evidence.
            if (implementation.id === task.id && latest.purpose?.type === 'implementation' &&
                !sameInvocationData(await coordinationContext(manager, implementation, actor), latest.purpose.coordination))
                throw projectTaskRuntimeError('Evidence')
            const reviews = await implementationReviews(manager, implementation, actor)
            const latestReview = reviews.find(
                (attempt) =>
                    attempt.purpose?.type === 'review' &&
                    attempt.purpose.implementationExecutionId === input.implementationExecutionId
            )
            const reviewer = latest.purpose?.type === 'implementation' ? latest.purpose.reviewer : undefined
            if (input.outcome === 'accept' && reviewer && !latestReview) throw projectTaskRuntimeError('ReviewerRequired')
            if (input.outcome === 'accept' && latestReview && input.reviewExecutionId !== latestReview.id)
                throw projectTaskRuntimeError('Evidence')
            if (input.reviewExecutionId) {
                const review = await manager.getRepository(XpertProjectTaskExecution).findOneBy({
                    ...where,
                    projectId,
                    id: input.reviewExecutionId,
                    createdById: actor.userId
                })
                if (
                    !review?.invocationId ||
                    review.purpose?.type !== 'review' ||
                    review.purpose.implementationExecutionId !== input.implementationExecutionId ||
                    !sameInvocationData(review.purpose.evidence, input.evidence)
                )
                    throw projectTaskRuntimeError('Evidence')
                const reviewTask = await manager.getRepository(XpertProjectTask).findOne({
                    where: { ...where, projectId, id: review.taskId }, relations: ['steps']
                })
                if (!reviewTask || reviewTask.status === 'cancelled' ||
                    (await reviewImplementationTask(manager, reviewTask, actor, review.purpose)).id !== implementation.id)
                    throw projectTaskRuntimeError('Evidence')
                const row = await manager
                    .getRepository(AgentInvocationEntity)
                    .findOneBy({ ...where, id: review.invocationId, ownerId: actor.userId })
                if (!row || row.invocation.status !== 'succeeded' || !invocationCanRelease(row.invocation))
                    throw projectTaskRuntimeError('State')
                const reference = row.invocation.request.dispatch?.projectTask
                if (
                    reference?.projectId !== projectId ||
                    reference.projectTaskId !== review.taskId ||
                    reference.taskExecutionId !== review.id ||
                    !sameInvocationData(reference.purpose, review.purpose)
                )
                    throw projectTaskRuntimeError('Evidence')
                // Read the verdict only from the same review revision returned by inspection.
                if (inspected.get(row.id) !== row.invocation.revision) throw projectTaskRuntimeError('Conflict')
                if (reviewer && (row.invocation.request.target.bindingId !== reviewer.bindingId ||
                    (review.purpose.mode ?? 'evidence_only') !== reviewer.mode)) throw projectTaskRuntimeError('Evidence')
                const report = reviewReport(review.purpose, row.invocation.result?.text)
                // Explain delivery defects without repairing the report or changing the review verdict.
                if (!report) throw projectTaskRuntimeError('ReviewReport', diagnoseReviewReport(review.purpose, row.invocation.result?.text))
                if (input.outcome === 'accept' && report.verdict !== 'pass') throw projectTaskRuntimeError('Evidence')
                if (input.outcome === 'accept' && review.purpose.mode === 'execution') {
                    // Other owned work can still mutate the shared checkout. Fail closed until all attempts have stopped.
                    // This guards platform-managed work, not arbitrary filesystem writes after the point-in-time comparison.
                    const attempts = await manager.getRepository(XpertProjectTaskExecution).findBy({ ...where, projectId })
                    const ids = attempts.flatMap((attempt) => attempt.invocationId ? [attempt.invocationId] : [])
                    const records = ids.length ? await manager.getRepository(AgentInvocationEntity).findBy({ ...where, id: In(ids) }) : []
                    if (attempts.some((attempt) => attempt.invocationId
                        ? !records.some((item) => item.id === attempt.invocationId && invocationCanRelease(item.invocation))
                        : ['queued', 'running'].includes(attempt.status))) throw projectTaskRuntimeError('Busy')
                }
            }
            const decision = projectTaskDecisionSchema.parse({
                ...input,
                actorId: actor.userId,
                actorType: caller?.type ?? 'user',
                executionId: caller?.executionId,
                decidedAt: new Date().toISOString(),
                taskRevision: task.revision + 1
            })
            // Commit the decision and status together; CAS prevents overwriting a newer task revision.
            const updated = await manager.getRepository(XpertProjectTask).update(
                { ...where, id: task.id, revision: task.revision },
                {
                    status: input.outcome === 'accept' ? 'done' : 'todo',
                    decisions: [...decisions, decision],
                    revision: task.revision + 1
                }
            )
            if (updated.affected !== 1) throw projectTaskRuntimeError('Conflict')
            // A concurrent child change must roll back the parent decision as well.
            if (implementation.id !== task.id) {
                const childDecision = projectTaskDecisionSchema.parse({ ...decision, taskId: implementation.id,
                    expectedRevision: implementation.revision, taskRevision: implementation.revision + 1 })
                const changed = await manager.getRepository(XpertProjectTask).update(
                    { ...where, id: implementation.id, revision: implementation.revision },
                    { status: input.outcome === 'accept' ? 'done' : 'todo', revision: implementation.revision + 1,
                        decisions: [...(implementation.decisions ?? []), childDecision] }
                )
                if (changed.affected !== 1) throw projectTaskRuntimeError('Conflict')
            }
            return decision
        })
    }
}
