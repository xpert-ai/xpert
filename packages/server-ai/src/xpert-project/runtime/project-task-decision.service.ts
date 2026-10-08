// Invariants: only the responsible caller or an authorized human can decide business completion.
// A decision, its evidence and the task CAS commit together; retries return the original decision.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
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
import { implementationEvidence, reviewReport } from './project-task-evidence'
import { projectTaskRuntimeError } from './project-task-runtime.errors'

@Injectable()
export class ProjectTaskDecisionService {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: XpertProjectAccessService,
        private readonly context: ProjectTaskRuntimeContextService,
        private readonly factory: AgentInvocationFactoryService
    ) {}

    async decide(projectId: string, input: ProjectTaskDecisionInput, caller?: ProjectTaskCaller) {
        const actor = this.context.actor()
        await this.access.assertCanEdit(projectId)
        const scope = caller ? await this.context.resolve(projectId, caller) : null
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
            if (existing) {
                if (
                    existing.actorId !== actor.userId ||
                    existing.actorType !== (caller?.type ?? 'user') ||
                    !sameInvocationData(projectTaskDecisionInputSchema.strip().parse(existing), input)
                )
                    throw projectTaskRuntimeError('Conflict')
                return existing
            }
            if (task.revision !== input.expectedRevision || !['review', 'blocked', 'in_progress'].includes(task.status))
                throw projectTaskRuntimeError('Conflict')
            const { invocation } = await implementationEvidence(
                manager,
                task,
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
            await this.factory.createCapturedApi(invocation.scope).inspect(invocation.id)
            if (input.outcome === 'accept' && invocation.status !== 'succeeded') throw projectTaskRuntimeError('State')
            const reviews = await manager.getRepository(XpertProjectTaskExecution).find({
                where: { ...where, projectId, taskId: task.id },
                order: { attempt: 'DESC' }
            })
            const latestReview = reviews.find(
                (attempt) =>
                    attempt.purpose?.type === 'review' &&
                    attempt.purpose.implementationExecutionId === input.implementationExecutionId
            )
            if (input.outcome === 'accept' && latestReview && input.reviewExecutionId !== latestReview.id)
                throw projectTaskRuntimeError('Evidence')
            if (input.reviewExecutionId) {
                const review = await manager.getRepository(XpertProjectTaskExecution).findOneBy({
                    ...where,
                    projectId,
                    taskId: task.id,
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
                const row = await manager
                    .getRepository(AgentInvocationEntity)
                    .findOneBy({ ...where, id: review.invocationId, ownerId: actor.userId })
                if (!row || row.invocation.status !== 'succeeded') throw projectTaskRuntimeError('State')
                const reference = row.invocation.request.dispatch?.projectTask
                if (
                    reference?.projectId !== projectId ||
                    reference.projectTaskId !== task.id ||
                    reference.taskExecutionId !== review.id ||
                    !sameInvocationData(reference.purpose, review.purpose)
                )
                    throw projectTaskRuntimeError('Evidence')
                await this.factory.createCapturedApi(row.invocation.scope).inspect(row.id)
                const report = reviewReport(review.purpose, row.invocation.result?.text)
                if (!report || (input.outcome === 'accept' && report.verdict !== 'pass'))
                    throw projectTaskRuntimeError('Evidence')
            }
            const decision = projectTaskDecisionSchema.parse({
                ...input,
                actorId: actor.userId,
                actorType: caller?.type ?? 'user',
                executionId: caller?.executionId,
                decidedAt: new Date().toISOString(),
                taskRevision: task.revision + 1
            })
            const updated = await manager.getRepository(XpertProjectTask).update(
                { ...where, id: task.id, revision: task.revision },
                {
                    status: input.outcome === 'accept' ? 'done' : 'todo',
                    decisions: [...decisions, decision],
                    revision: task.revision + 1
                }
            )
            if (updated.affected !== 1) throw projectTaskRuntimeError('Conflict')
            return decision
        })
    }
}
