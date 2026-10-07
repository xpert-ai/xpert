import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { projectTaskSpecificationSchema } from '@xpert-ai/contracts'
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
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../../handoff/runtime-messaging/runtime-message.entity'
import { CommandBus } from '@nestjs/cqrs'
import { RequestRuntimeResultCheckCommand } from '../../handoff/runtime-messaging/runtime-result-check.handler'

@Injectable()
export class ProjectTaskRuntimeReadService {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: XpertProjectAccessService,
        private readonly context: ProjectTaskRuntimeContextService,
        private readonly factory: AgentInvocationFactoryService,
        private readonly commandBus: CommandBus
    ) {}

    async get(projectId: string, taskId: string) {
        if (!z.string().uuid().safeParse(taskId).success) throw projectTaskRuntimeError('Invalid')
        const actor = this.context.actor()
        await this.access.assertCanRead(projectId)
        const task = await this.tasks.findOne({
            where: { id: taskId, projectId, tenantId: actor.tenantId, organizationId: actor.organizationId },
            relations: ['steps', 'executions']
        })
        if (!task) throw projectTaskRuntimeError('NotFound')
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
            const invocation = await this.factory.createCapturedApi(record.invocation.scope).inspect(record.id)
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
                invocationRevision: invocation.revision,
                runtimeProvider: invocation.request.target.provider,
                runtimeToolId: invocation.handle?.runner?.tool.id,
                reviewReport: reviewReport(execution.purpose, invocation.result?.text),
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
        return {
            ...task,
            specificationSnapshot: specification.success
                ? createProjectTaskSpecificationSnapshot(specification.data)
                : null,
            executions
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
        return { invocationId: invocation.id, status: invocation.status }
    }
}
