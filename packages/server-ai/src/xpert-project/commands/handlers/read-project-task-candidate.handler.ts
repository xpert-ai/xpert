// Read one persisted candidate snapshot. Domain preflight must never dispatch, reconcile or accept work.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, type ProjectTaskCandidateReceipt } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { invocationCanRelease } from '../../../agent-invocation/invocation-control-evidence'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { implementationEvidence, taskSpecification } from '../../runtime/project-task-evidence'
import { projectTaskRuntimeError } from '../../runtime/project-task-runtime.errors'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { assertOrdinaryTask } from '../../services/project-task-ownership'
import { ReadProjectTaskCandidateCommand } from '../read-project-task-candidate.command'

@CommandHandler(ReadProjectTaskCandidateCommand)
export class ReadProjectTaskCandidateHandler implements ICommandHandler<ReadProjectTaskCandidateCommand> {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: XpertProjectAccessService
    ) {}

    async execute({
        context: { actor, projectId },
        taskId
    }: ReadProjectTaskCandidateCommand): Promise<ProjectTaskCandidateReceipt> {
        if (
            !actor.organizationId ||
            RequestContext.currentUserId() !== actor.userId ||
            RequestContext.currentTenantId() !== actor.tenantId ||
            RequestContext.getOrganizationId() !== actor.organizationId
        )
            throw projectTaskRuntimeError('Scope')
        await this.access.assertCanRead(projectId)
        return this.tasks.manager.transaction('REPEATABLE READ', async (manager) => {
            const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId, projectId }
            const task = await manager
                .getRepository(XpertProjectTask)
                .findOne({ where: { ...scope, id: taskId }, relations: ['steps'] })
            if (!task) throw projectTaskRuntimeError('NotFound')
            assertOrdinaryTask(task)
            if (task.kind !== 'task' || task.status === 'cancelled') throw projectTaskRuntimeError('State')
            const attempts = await manager
                .getRepository(XpertProjectTaskExecution)
                .find({ where: { ...scope, taskId }, order: { attempt: 'DESC' } })
            const attempt = attempts.find((item) => item.purpose?.type !== 'review')
            if (
                !attempt?.invocationId ||
                attempt.createdById !== actor.userId ||
                attempt.purpose?.type !== 'implementation'
            )
                throw projectTaskRuntimeError('State')
            const invocation = (
                await manager.getRepository(AgentInvocationEntity).findOneBy({
                    id: attempt.invocationId,
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    ownerId: actor.userId
                })
            )?.invocation
            const dispatch = invocation?.request.dispatch?.projectTask
            if (
                !invocation ||
                invocation.status !== 'succeeded' ||
                !invocationCanRelease(invocation) ||
                !invocation.scope.conversationId ||
                dispatch?.projectId !== projectId ||
                dispatch.projectTaskId !== taskId ||
                dispatch.taskExecutionId !== attempt.id
            )
                throw projectTaskRuntimeError('State')
            const artifacts = (invocation.result?.artifacts ?? []).flatMap((item) =>
                item.versionId ? [{ artifactId: item.id, versionId: item.versionId }] : []
            )
            await implementationEvidence(
                manager,
                task,
                { tenantId: actor.tenantId, organizationId: actor.organizationId, userId: actor.userId },
                attempt.id,
                taskSpecification(task).digest,
                [
                    { type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision },
                    ...artifacts.map((item) => ({ type: 'artifact' as const, ...item }))
                ]
            )
            return {
                projectId,
                taskId,
                taskRevision: task.revision,
                conversationId: invocation.scope.conversationId,
                executionId: attempt.id,
                artifacts
            }
        })
    }
}
