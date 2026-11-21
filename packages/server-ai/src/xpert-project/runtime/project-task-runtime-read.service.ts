import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import type { TaskResultRead } from './project-task-result-page'
import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { projectTaskSpecificationSchema, type AgentDeliveryRecovery } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { projectTaskInvocationView } from './project-task-invocation-view'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { projectTaskRuntimeError } from './project-task-runtime.errors'
import { createProjectTaskSpecificationSnapshot } from './project-task-specification'
import { reviewReport } from './project-task-evidence'
import { diagnoseReviewReport } from './project-task-review-report-diagnostic'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../../handoff/runtime-messaging/runtime-message.entity'
import { CommandBus } from '@nestjs/cqrs'
import { RequestRuntimeResultCheckCommand } from '../../handoff/runtime-messaging/runtime-result-check.handler'
import { taskDecisionOptions } from './project-task-decision-reference'

@Injectable()
export class ProjectTaskRuntimeReadService {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: XpertProjectAccessService,
        private readonly context: ProjectTaskRuntimeContextService,
        private readonly factory: AgentInvocationFactoryService,
        private readonly commandBus: CommandBus
    ) {}

    async get(
        projectId: string,
        taskId: string,
        observe = true,
        selection?: { executionId?: string; includeDecisions?: boolean }
    ) {
        if (!z.string().uuid().safeParse(taskId).success) throw projectTaskRuntimeError('Invalid')
        const actor = this.context.actor()
        await this.access.assertCanRead(projectId)
        const task = await this.tasks.findOne({
            where: { id: taskId, projectId, tenantId: actor.tenantId, organizationId: actor.organizationId },
            relations: selection ? ['steps'] : ['steps', 'executions']
        })
        if (!task) throw projectTaskRuntimeError('NotFound')
        if (selection) {
            task.executions = selection.executionId
                ? await this.tasks.manager.find(XpertProjectTaskExecution, {
                      where: {
                          id: selection.executionId,
                          taskId,
                          projectId,
                          tenantId: actor.tenantId,
                          organizationId: actor.organizationId
                      },
                      loadEagerRelations: false
                  })
                : []
            if (selection.executionId && !task.executions.length) throw projectTaskRuntimeError('NotFound')
        }
        const specification = projectTaskSpecificationSchema.safeParse({
            version: 1,
            title: task.title || task.name,
            description: task.description ?? undefined,
            requirements: task.requirements ?? [],
            steps: task.steps.map(({ stepIndex, description }) => ({ stepIndex, description }))
        })
        const executions = []
        for (const execution of [...(task.executions ?? [])].sort((a, b) => b.attempt - a.attempt)) {
            if (!execution.invocationId) {
                executions.push(execution)
                continue
            }
            const record = await this.tasks.manager.getRepository(AgentInvocationEntity).findOneBy({
                id: execution.invocationId,
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                ownerId: actor.userId
            })
            if (!record) {
                executions.push({
                    ...projectTaskInvocationView(execution),
                    observation:
                        execution.createdById !== actor.userId
                            ? 'restricted'
                            : execution.dispatchState === 'pending'
                              ? 'pending'
                              : 'unknown'
                })
                continue
            }
            const reference = record.invocation.request.dispatch?.projectTask
            if (
                reference?.projectId !== projectId ||
                reference.projectTaskId !== taskId ||
                reference.taskExecutionId !== execution.id
            )
                throw projectTaskRuntimeError('Invalid')
            const invocation = observe
                ? await this.factory.createCapturedApi(record.invocation.scope).inspect(record.id)
                : record.invocation
            const where = {
                invocationId: invocation.id,
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                ownerId: actor.userId
            }
            const [delivery, consumption] = await Promise.all([
                this.tasks.manager
                    .getRepository(AgentRuntimeDelivery)
                    .find({ where, select: ['state', 'lastError', 'updatedAt'] }),
                this.tasks.manager
                    .getRepository(AgentRuntimeInbox)
                    .find({ where, select: ['state', 'lastError', 'updatedAt'] })
            ])
            executions.push({
                ...projectTaskInvocationView(execution, invocation),
                invocationStatus: invocation.status,
                controlEvidence: invocation.controlEvidence,
                invocationRevision: invocation.revision,
                runtimeProvider: invocation.request.target.provider,
                runtimeToolId: invocation.handle?.runner?.tool.id,
                executionBudget: invocation.handle?.runner?.executionBudget && {
                    maxDurationSeconds: invocation.handle.runner.executionBudget.maxDurationSeconds,
                    deadline: invocation.handle.runner.executionBudget.deadline
                },
                reviewReport: reviewReport(execution.purpose, invocation.result?.text),
                reviewReportDiagnostic:
                    invocation.status === 'succeeded' && execution.purpose?.type === 'review'
                        ? diagnoseReviewReport(execution.purpose, invocation.result?.text)
                        : null,
                delivery,
                consumption,
                evidence: [
                    { type: 'invocation_result' as const, invocationId: invocation.id, revision: invocation.revision },
                    ...(invocation.result?.artifacts ?? []).flatMap((artifact) =>
                        artifact.versionId
                            ? [{ type: 'artifact' as const, artifactId: artifact.id, versionId: artifact.versionId }]
                            : []
                    )
                ],
                progress: invocation.progress,
                result: invocation.result
                    ? {
                          text: invocation.result.text,
                          textTruncated: invocation.result.textTruncated,
                          report: invocation.result.report,
                          deliveryHistory: invocation.result.deliveryHistory,
                          data: invocation.result.data,
                          items: invocation.result.items,
                          artifacts: invocation.result.artifacts,
                          export: invocation.result.export
                      }
                    : undefined,
                interaction: invocation.interaction,
                error: invocation.error,
                observedAt: invocation.updatedAt,
                // No timestamp is fabricated from admission or process receipt creation.
                runtimeStartedAt: invocation.progress?.startedAt ?? null
            })
        }
        // Hierarchy navigation does not inspect child invocations or establish acceptance.
        const children = selection
            ? []
            : await this.tasks.find({
                  where: {
                      projectId,
                      tenantId: actor.tenantId,
                      organizationId: actor.organizationId,
                      parentTaskId: task.id
                  },
                  select: ['id', 'name', 'title', 'kind', 'status', 'revision', 'reviewSubject'],
                  order: { createdAt: 'ASC', id: 'ASC' },
                  loadEagerRelations: false
              })
        // A coordinated implementation's reviews are siblings; standalone reviews are its children.
        const related =
            !selection && (task.kind ?? 'task') === 'task' && !task.reviewSubject
                ? task.parentTaskId
                    ? await this.tasks.find({
                          where: {
                              projectId,
                              tenantId: actor.tenantId,
                              organizationId: actor.organizationId,
                              parentTaskId: task.parentTaskId
                          },
                          select: ['id', 'name', 'title', 'kind', 'status', 'revision', 'reviewSubject'],
                          order: { createdAt: 'ASC', id: 'ASC' },
                          loadEagerRelations: false
                      })
                    : children
                : []
        return {
            ...task,
            decisionOptions:
                !selection || selection.includeDecisions
                    ? await taskDecisionOptions(this.tasks.manager, actor, task)
                    : [],
            childTasks: children.map((child) => ({
                id: child.id,
                title: child.title || child.name,
                kind: child.kind,
                status: child.status,
                revision: child.revision
            })),
            reviewTasks: related
                .filter((child) => child.reviewSubject?.implementationTaskId === task.id)
                .map((child) => ({
                    id: child.id,
                    title: child.title || child.name,
                    kind: child.kind,
                    status: child.status,
                    revision: child.revision,
                    reviewSubject: child.reviewSubject
                })),
            specificationSnapshot: specification.success
                ? createProjectTaskSpecificationSnapshot(specification.data)
                : null,
            executions
        }
    }

    async readResult(projectId: string, input: TaskResultRead) {
        // Paging must not refresh the runner and invalidate the very revision being read.
        // Delegation prompts are immutable for an execution; live progress cannot invalidate them.
        const detail = await this.get(projectId, input.taskId, false, { executionId: input.executionId })
        const attempt = detail.executions.find((execution) => execution.id === input.executionId)
        if (!attempt || !('invocationRevision' in attempt)) throw projectTaskRuntimeError('NotFound')
        if (input.source !== 'prompt' && attempt.invocationRevision !== input.expectedRevision)
            throw projectTaskRuntimeError('Conflict')
        let text: string
        if (input.source === 'prompt') {
            const actor = this.context.actor()
            const record = await this.tasks.manager.getRepository(AgentInvocationEntity).findOneBy({
                id: attempt.invocationId,
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                ownerId: actor.userId
            })
            const reference = record?.invocation.request.dispatch?.projectTask
            if (
                reference?.projectId !== projectId ||
                reference.projectTaskId !== input.taskId ||
                reference.taskExecutionId !== input.executionId
            )
                throw projectTaskRuntimeError('NotFound')
            const parsed = z.object({ prompt: z.string() }).safeParse(record.invocation.request.input)
            if (!parsed.success) throw projectTaskRuntimeError('NotFound')
            text = parsed.data.prompt
        } else {
            if (!('result' in attempt) || !attempt.result) throw projectTaskRuntimeError('NotFound')
            text = attempt.result.text ?? ''
        }
        if (input.offset > text.length) throw projectTaskRuntimeError('Invalid')
        const end = Math.min(text.length, input.offset + input.limit)
        return {
            taskId: input.taskId,
            executionId: input.executionId,
            invocationRevision: attempt.invocationRevision,
            source: input.source ?? 'report',
            offset: input.offset,
            nextOffset: end < text.length ? end : null,
            totalCharacters: text.length,
            sha256: createHash('sha256').update(text).digest('hex'),
            sourceTruncated:
                input.source === 'prompt' ? false : (('result' in attempt && attempt.result?.textTruncated) ?? false),
            text: text.slice(input.offset, end)
        }
    }

    async recoverDelivery(projectId: string, taskId: string, executionId: string, input: AgentDeliveryRecovery) {
        await this.access.assertCanEdit(projectId)
        const detail = await this.get(projectId, taskId)
        // A completed review may still need its report/artifacts exported. Recovery
        // changes delivery only; the invocation API retains authorization and CAS checks.
        if (detail.status === 'cancelled') throw projectTaskRuntimeError('Invalid')
        const attempt = detail.executions.find((item) => item.id === executionId)
        if (!attempt?.invocationId) throw projectTaskRuntimeError('NotFound')
        const actor = this.context.actor()
        const record = await this.tasks.manager.getRepository(AgentInvocationEntity).findOneBy({
            id: attempt.invocationId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            ownerId: actor.userId
        })
        if (!record) throw projectTaskRuntimeError('Scope')
        const api = this.factory.createCapturedApi(record.invocation.scope)
        if (!api.recoverDelivery) throw projectTaskRuntimeError('Invalid')
        const invocation = await api.recoverDelivery(record.id, input)
        return {
            invocationId: invocation.id,
            revision: invocation.revision,
            status: invocation.status,
            result: invocation.result
        }
    }

    async control(projectId: string, taskId: string, executionId: string, action: 'cancel' | 'request-check') {
        await this.access.assertCanEdit(projectId)
        const detail = await this.get(projectId, taskId)
        const attempt = detail.executions.find((item) => item.id === executionId)
        if (!attempt?.invocationId) throw projectTaskRuntimeError('NotFound')
        const actor = this.context.actor()
        const record = await this.tasks.manager.getRepository(AgentInvocationEntity).findOneBy({
            id: attempt.invocationId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            ownerId: actor.userId
        })
        if (!record) throw projectTaskRuntimeError('Scope')
        if (action === 'request-check') {
            await this.commandBus.execute(
                new RequestRuntimeResultCheckCommand(record.id, {
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    ownerId: actor.userId
                })
            )
            return { invocationId: record.id }
        }
        const invocation = await this.factory.createCapturedApi(record.invocation.scope).cancel(record.id)
        return { invocationId: invocation.id, status: invocation.status, controlEvidence: invocation.controlEvidence }
    }
}
