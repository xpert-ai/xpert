import type { ConversationResourceCard } from '@xpert-ai/contracts'
import { AgentInvocationAuthorizationError } from '../../agent-invocation/invocation-errors'
// Invariants: commit the attempt and pinned intent before invoking an adapter.
// Project-row serialization is conservative until adapters can prove checkout isolation.
// Replays keep the original scope; unknown or missing receipts never permit another launch.
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { In, Repository } from 'typeorm'
import {
    assistantTaskGroupContext,
    ProjectTaskDispatchInput,
    ProjectTaskDispatchReceipt,
    projectTaskDispatchInputSchema,
    projectTaskSpecificationSchema
} from '@xpert-ai/contracts'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import { AgentInvocation, AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { agentInvocationId, sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { assertOrdinaryTask } from '../services/project-task-ownership'
import { implementationEvidence, reviewPrompt } from './project-task-evidence'
import {
    ProjectTaskCaller,
    ProjectTaskDispatchIntent,
    projectTaskDispatchIntentSchema,
    projectTaskInvocationScope
} from './project-task-dispatch.schema'
import { ProjectTaskCardProvider } from './project-task-card.provider'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { projectTaskRuntimeError } from './project-task-runtime.errors'
import { XpertProjectXpertBindingService } from '../services/project-xpert-binding.service'
import {
    createProjectTaskSpecificationSnapshot,
    parseProjectTaskSpecificationSnapshot
} from './project-task-specification'

@Injectable()
export class ProjectTaskDispatchService {
    constructor(
        @InjectRepository(XpertProjectTaskExecution) private readonly executions: Repository<XpertProjectTaskExecution>,
        private readonly context: ProjectTaskRuntimeContextService,
        private readonly factory: AgentInvocationFactoryService,
        private readonly cards: ProjectTaskCardProvider,
        private readonly xpertBindings: XpertProjectXpertBindingService
    ) {}

    /**
     * Authorize and reserve delegated work before starting its Runtime invocation.
     * A new review inspects its implementation outside the Project transaction, then rechecks
     * the inspected revision against the persisted evidence while holding the Project lock.
     */
    async dispatch(
        projectId: string,
        input: ProjectTaskDispatchInput,
        caller: ProjectTaskCaller
    ): Promise<ProjectTaskDispatchReceipt & { card: ConversationResourceCard }> {
        const parsed = projectTaskDispatchInputSchema.safeParse(input)
        if (!parsed.success) throw projectTaskRuntimeError('Invalid')
        input = parsed.data
        if (input.target && input.delivery && input.delivery.mode !== 'none') throw projectTaskRuntimeError('Invalid')
        const scope = await this.context.resolve(projectId, caller)
        // Authorization precedes both reservation and idempotent replay.
        const target = input.target
            ? await this.factory.resolveGroupTarget(scope, input.target.participantId)
            : await this.factory.resolveBackgroundTarget(scope, input.bindingId)
        // Reserve the Runtime's stable call identity while retaining this attempt for admission checks.
        const identityScope = await this.factory.resolveInvocationIdentityScope(scope)
        const purpose = input.purpose ?? { type: 'implementation' as const }
        // Evidence-only confinement is currently enforced by the Computer runner.
        if (
            purpose.type === 'review' &&
            ((input.delivery && input.delivery.mode !== 'none') ||
                target.provider !== 'opencode' ||
                !z.object({ type: z.literal('computer') }).safeParse(target.configuration.executionEnvironment).success)
        )
            throw projectTaskRuntimeError('Evidence')
        let inspectedRevision: number | undefined
        if (purpose.type === 'review') {
            // A saved dispatch reuses its pinned intent; do not depend on inspecting the implementation again.
            // The transaction below still validates replay input, caller and target before returning it.
            const replay = await this.executions.findOneBy({
                projectId, tenantId: scope.tenantId, organizationId: scope.organizationId,
                createdById: scope.userId, dispatchRequestId: input.requestId
            })
            if (!replay) {
                const row = await this.executions.manager.getRepository(AgentInvocationEntity).findOneBy({
                    id: purpose.implementationInvocationId, tenantId: scope.tenantId,
                    organizationId: scope.organizationId, ownerId: scope.userId
                })
                if (!row || row.invocation.scope.projectId !== projectId) throw projectTaskRuntimeError('Evidence')
                // Runtime inspection can perform network I/O or reconcile state through another DB connection.
                // Keep it outside the transaction and capture the returned revision, not the row read above.
                inspectedRevision = (await this.factory.createCapturedApi(row.invocation.scope).inspect(row.id)).revision
            }
        }
        const execution = await this.executions.manager.transaction(async (manager) => {
            const where = { projectId, tenantId: scope.tenantId, organizationId: scope.organizationId }
            const project = await manager.getRepository(XpertProject).findOne({
                where: { id: projectId, tenantId: scope.tenantId, organizationId: scope.organizationId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!project || project.status === 'archived') throw projectTaskRuntimeError('Scope')
            const repository = manager.getRepository(XpertProjectTaskExecution)
            const existing = await repository
                .createQueryBuilder('attempt')
                .addSelect('attempt.dispatchIntent')
                .where({ ...where, createdById: scope.userId, dispatchRequestId: input.requestId })
                .getOne()
            if (existing) {
                const intent = this.intent(existing)
                if (
                    !sameInvocationData(intent.input, input) ||
                    !sameCaller(intent.scope, scope) ||
                    intent.request.dispatch.replyTo.threadId !== caller.threadId ||
                    !sameInvocationData(intent.request.target, target)
                )
                    throw projectTaskRuntimeError('Conflict')
                if (!existing.xpertId) throw projectTaskRuntimeError('AssigneeRequired')
                await this.context.assertResponsibleAssistant(scope, existing.xpertId)
                return existing
            }
            const tasks = manager.getRepository(XpertProjectTask)
            let task = await tasks.findOne({
                where: { ...where, id: input.taskId },
                relations: ['steps']
            })
            if (!task) throw projectTaskRuntimeError('NotFound')
            assertOrdinaryTask(task)
            // Responsibility uses the current Assistant identity; the Runtime target stays version-pinned.
            // External runtimes preserve an existing owner, defaulting unassigned tasks to the caller.
            let assigneeXpertId = task.assigneeXpertId
            if (input.target || !assigneeXpertId) {
                const selectedId = input.target ? target.reference : scope.callerXpertId
                assigneeXpertId = selectedId
                    ? (await this.xpertBindings.resolveCurrentById(selectedId, scope))?.id
                    : undefined
            }
            if (!assigneeXpertId) throw projectTaskRuntimeError('AssigneeRequired')
            await this.context.assertResponsibleAssistant(scope, assigneeXpertId)
            if (task.revision !== input.expectedRevision) throw projectTaskRuntimeError('Conflict')
            if (task.kind !== 'task' || !['todo', 'in_progress', 'blocked', 'review'].includes(task.status))
                throw projectTaskRuntimeError('State')
            const specification = projectTaskSpecificationSchema.safeParse({
                version: 1,
                title: task.title || task.name,
                description: task.description ?? undefined,
                requirements: task.requirements ?? [],
                steps: (task.steps ?? []).map(({ stepIndex, description }) => ({ stepIndex, description }))
            })
            if (!specification.success) throw projectTaskRuntimeError('Invalid')
            const specificationSnapshot = createProjectTaskSpecificationSnapshot(specification.data)
            let prompt = implementationPrompt(specificationSnapshot.specification, input.instructions)
            if (purpose.type === 'review') {
                const subject = await implementationEvidence(
                    manager,
                    task,
                    scope,
                    purpose.implementationExecutionId,
                    purpose.specificationDigest,
                    purpose.evidence
                )
                if (
                    subject.invocation.id !== purpose.implementationInvocationId ||
                    subject.invocation.status !== 'succeeded'
                )
                    throw projectTaskRuntimeError('Evidence')
                // Evidence was reloaded under the Project lock; reject drift since inspection before reserving work.
                if (subject.invocation.revision !== inspectedRevision) throw projectTaskRuntimeError('Conflict')
                prompt = reviewPrompt(
                    purpose,
                    task,
                    JSON.stringify(subject.invocation.result ?? null),
                    subject.invocation.handle?.runner?.workingDirectory
                )
            }
            const predecessors = [...new Set(task.predecessorIds ?? [])]
            if (predecessors.length) {
                const dependencies = await manager
                    .getRepository(XpertProjectTask)
                    .find({ where: { ...where, id: In(predecessors) } })
                if (
                    dependencies.length !== predecessors.length ||
                    dependencies.some((item) => !['done', 'completed'].includes(item.status))
                )
                    throw projectTaskRuntimeError('Dependencies')
            }
            const attempts = await repository.find({ where, relations: ['task'], order: { attempt: 'DESC' } })
            const invocationIds = attempts.flatMap((attempt) => (attempt.invocationId ? [attempt.invocationId] : []))
            const invocations = invocationIds.length
                ? await manager.getRepository(AgentInvocationEntity).find({
                      where: { tenantId: scope.tenantId, organizationId: scope.organizationId, id: In(invocationIds) }
                  })
                : []
            if (
                attempts.some((attempt) => {
                    // A native Pipeline Assistant coordinates child tasks; its projection does not reserve the Computer.
                    // Invocation-backed Pipeline work and unacknowledged attempts still hold the reservation.
                    if (!attempt.invocationId && attempt.agentExecutionId && attempt.task?.controlKind === 'pipeline')
                        return false
                    // Group members have isolated conversation runtimes; retries of the same task remain serialized.
                    if (!attempt.invocationId) return attempt.status === 'queued' || attempt.status === 'running'
                    const record = invocations.find((record) => record.id === attempt.invocationId)
                    if (
                        input.target &&
                        attempt.taskId !== task.id &&
                        record &&
                        assistantTaskGroupContext(record.invocation.request.target)
                    )
                        return false
                    return !record || !invocationCanRelease(record.invocation)
                })
            )
                throw projectTaskRuntimeError('Busy')
            if (task.assigneeXpertId !== assigneeXpertId) {
                task.assigneeXpertId = assigneeXpertId
                task = await tasks.save(task)
            }
            const taskExecutionId = randomUUID()
            const intent = projectTaskDispatchIntentSchema.parse({
                version: 1,
                input,
                scope,
                invocationParentExecutionId: identityScope.parentExecutionId,
                request: {
                    callId: `project-task:${input.requestId}`,
                    target,
                    input: { prompt, ...(input.delivery ? { delivery: input.delivery } : {}) },
                    dispatch: {
                        version: 1,
                        requestId: input.requestId,
                        sourceMessageId: caller.sourceMessageId,
                        replyTo:
                            scope.callerType === 'project_agent'
                                ? {
                                      type: 'project_agent',
                                      projectId,
                                      agentKey: 'general_agent',
                                      conversationId: scope.conversationId,
                                      threadId: caller.threadId
                                  }
                                : {
                                      xpertId: scope.callerXpertId,
                                      agentKey: scope.callerAgentKey,
                                      conversationId: scope.conversationId,
                                      threadId: caller.threadId
                                  },
                        projectTask: {
                            projectId,
                            projectTaskId: task.id,
                            taskExecutionId,
                            specification: specificationSnapshot,
                            purpose
                        }
                    }
                }
            })
            return repository.save(
                repository.create({
                    ...where,
                    id: taskExecutionId,
                    taskId: task.id,
                    createdById: scope.userId,
                    conversationId: scope.conversationId,
                    threadId: caller.threadId,
                    // xpertId is the responsible Assistant, not a fabricated CLI identity.
                    xpertId: task.assigneeXpertId,
                    attempt: (attempts.find((item) => item.taskId === task.id)?.attempt ?? 0) + 1,
                    status: 'queued',
                    invocationId: agentInvocationId(identityScope, intent.request.callId),
                    dispatchRequestId: input.requestId,
                    dispatchState: 'pending',
                    dispatchNextAttemptAt: new Date(),
                    projectedTaskRevision: task.revision,
                    specificationSnapshot,
                    purpose,
                    dispatchIntent: intent
                })
            )
        })
        return this.submit(execution)
    }

    /** Replaying a saved intent also recovers a crash before Invocation reservation. Never invent a new call ID. */
    private async submit(
        execution: XpertProjectTaskExecution
    ): Promise<ProjectTaskDispatchReceipt & { card: ConversationResourceCard }> {
        const intent = this.intent(execution)
        const reserved = await this.executions.manager.getRepository(AgentInvocationEntity).findOneBy({
            id: execution.invocationId,
            tenantId: intent.scope.tenantId,
            organizationId: intent.scope.organizationId,
            ownerId: intent.scope.userId
        })
        if (!reserved || reserved.invocation.status === 'queued') {
            const current = await this.executions.manager.getRepository(XpertProjectTask).findOne({
                where: {
                    id: execution.taskId,
                    projectId: execution.projectId,
                    tenantId: intent.scope.tenantId,
                    organizationId: intent.scope.organizationId
                },
                relations: ['steps']
            })
            if (!current) throw projectTaskRuntimeError('NotFound')
            assertOrdinaryTask(current)
            if (!['todo', 'in_progress', 'blocked', 'review'].includes(current.status))
                throw projectTaskRuntimeError('State')
            const specification = projectTaskSpecificationSchema.safeParse({
                version: 1,
                title: current.title || current.name,
                description: current.description ?? undefined,
                requirements: current.requirements ?? [],
                steps: current.steps.map(({ stepIndex, description }) => ({ stepIndex, description }))
            })
            if (
                !specification.success ||
                createProjectTaskSpecificationSnapshot(specification.data).digest !==
                    intent.request.dispatch.projectTask.specification.digest
            )
                throw projectTaskRuntimeError('Conflict')
            const purpose = intent.request.dispatch.projectTask.purpose
            if (purpose.type === 'review')
                await implementationEvidence(
                    this.executions.manager,
                    current,
                    intent.scope,
                    purpose.implementationExecutionId,
                    purpose.specificationDigest,
                    purpose.evidence
                )
        }
        const api = this.factory.createCapturedApi(intent.scope)
        const identityScope = projectTaskInvocationScope(intent)
        // Recovery must not remap a persisted reservation to a different invocation.
        if (!sameInvocationData(await this.factory.resolveInvocationIdentityScope(intent.scope), identityScope))
            throw projectTaskRuntimeError('Conflict')
        let invocation: AgentInvocation
        try {
            invocation = await api.start(intent.request)
        } catch (error) {
            if (error instanceof AgentInvocationAuthorizationError) throw error
            // Log call sites, never adapter inputs or messages that could contain credentials.
            Logger.warn(
                {
                    event: 'project_task_launch_unconfirmed',
                    errorType: error instanceof Error ? error.name : typeof error,
                    callSites:
                        error instanceof Error
                            ? error.stack
                                  ?.split('\n')
                                  .filter((line) => /^\s+at /.test(line))
                                  .slice(0, 6)
                            : []
                },
                ProjectTaskDispatchService.name
            )
            // A launch failure can already have a durable unknown receipt. Return that handle, not a retry hint.
            const record = await this.executions.manager.getRepository(AgentInvocationEntity).findOneBy({
                id: execution.invocationId,
                tenantId: intent.scope.tenantId,
                organizationId: intent.scope.organizationId,
                ownerId: intent.scope.userId
            })
            if (
                !record ||
                !sameInvocationData(record.invocation.request, intent.request) ||
                !sameInvocationData(record.invocation.scope, identityScope)
            )
                throw error
            invocation = record.invocation
        }
        // A successful response must match the reservation just as strictly as a recovered receipt.
        if (invocation.id !== execution.invocationId ||
            !sameInvocationData(invocation.scope, identityScope) ||
            !sameInvocationData(invocation.request, intent.request)) throw projectTaskRuntimeError('Conflict')
        // Avoid older concurrent receipts overwriting newer runtime facts: Invocation is the source of truth.
        await this.executions.update(
            { id: execution.id, dispatchState: 'pending' },
            { dispatchState: 'submitted', dispatchNextAttemptAt: null, dispatchError: null }
        )
        return {
            projectId: execution.projectId,
            projectTaskId: execution.taskId,
            taskExecutionId: execution.id,
            invocationId: invocation.id,
            status: invocation.status,
            card: this.cards.createCard({
                type: 'execution',
                id: execution.id,
                title: execution.specificationSnapshot.specification.title,
                status: invocation.status,
                attempt: execution.attempt,
                purpose: execution.purpose?.type,
                provider: invocation.request.target.provider,
                codingInvocationId: invocation.activity?.presentation === 'coding' ? invocation.id : undefined
            })
        }
    }

    intent(execution: XpertProjectTaskExecution): ProjectTaskDispatchIntent {
        const parsed = projectTaskDispatchIntentSchema.safeParse(execution.dispatchIntent)
        if (!parsed.success) throw projectTaskRuntimeError('Invalid')
        const intent = parsed.data
        const task = intent.request.dispatch.projectTask
        if (
            !task ||
            task.projectId !== execution.projectId ||
            task.projectTaskId !== execution.taskId ||
            task.taskExecutionId !== execution.id ||
            !sameInvocationData(task.purpose, execution.purpose) ||
            intent.scope.projectId !== execution.projectId ||
            intent.scope.userId !== execution.createdById ||
            intent.scope.tenantId !== execution.tenantId ||
            intent.scope.organizationId !== execution.organizationId ||
            intent.input.requestId !== execution.dispatchRequestId ||
            intent.input.taskId !== execution.taskId ||
            intent.request.dispatch.requestId !== execution.dispatchRequestId ||
            intent.request.target.bindingId !== (intent.input.target?.participantId ?? intent.input.bindingId) ||
            Boolean(intent.input.target) !== Boolean(assistantTaskGroupContext(intent.request.target)) ||
            !sameInvocationData(
                intent.input.delivery ?? { mode: 'none' },
                intent.request.input.delivery ?? { mode: 'none' }
            ) ||
            execution.invocationId !== agentInvocationId(projectTaskInvocationScope(intent), intent.request.callId)
        )
            throw projectTaskRuntimeError('Invalid')
        const reply = intent.request.dispatch.replyTo
        if (
            reply.conversationId !== intent.scope.conversationId ||
            reply.threadId !== execution.threadId ||
            reply.agentKey !== intent.scope.callerAgentKey ||
            (reply.type === 'project_agent'
                ? intent.scope.callerType !== 'project_agent' ||
                  reply.projectId !== execution.projectId ||
                  Boolean(intent.scope.callerXpertId)
                : intent.scope.callerType === 'project_agent' || reply.xpertId !== intent.scope.callerXpertId)
        )
            throw projectTaskRuntimeError('Invalid')
        parseProjectTaskSpecificationSnapshot(task.specification)
        return intent
    }
}

function sameCaller(a: AgentInvocationScope, b: AgentInvocationScope) {
    return (
        a.tenantId === b.tenantId &&
        a.organizationId === b.organizationId &&
        a.userId === b.userId &&
        a.workspaceId === b.workspaceId &&
        a.projectId === b.projectId &&
        a.conversationId === b.conversationId &&
        a.callerType === b.callerType &&
        a.callerXpertId === b.callerXpertId &&
        a.callerAgentKey === b.callerAgentKey
    )
}

function implementationPrompt(
    specification: ReturnType<typeof projectTaskSpecificationSchema.parse>,
    instructions: string
) {
    return [
        'Implement the delegated project task below. Report your outcome and evidence; the calling Agent decides business acceptance.',
        `Task specification (JSON):\n${JSON.stringify(specification, null, 2)}`,
        instructions ? `Additional delegation instructions:\n${instructions}` : ''
    ]
        .filter(Boolean)
        .join('\n\n')
}
