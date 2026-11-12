// Project lock + latest attempt + unchanged specification + unchanged decision revision fence late observations.
// Runtime facts remain in Invocation. A valid report can complete its review work item, never the delivery.
// A child observation never sets its summary's status; summary decisions belong to coordination.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { AgentInvocation, agentInvocationDispatchContextSchema, RequestContext } from '@xpert-ai/plugin-sdk'
import { projectTaskSpecificationSchema } from '@xpert-ai/contracts'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { ProjectRuntimeObservationCommand } from '../../handoff/runtime-messaging/runtime-message.commands'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { createProjectTaskSpecificationSnapshot } from './project-task-specification'
import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { reviewReport } from './project-task-evidence'

export function runtimeTaskStatus(invocation: AgentInvocation): 'in_progress' | 'review' | 'blocked' | undefined {
    if (invocation.status === 'succeeded' && invocationCanRelease(invocation)) return 'review'
    if (invocation.status === 'failed' && invocationCanRelease(invocation)) return 'blocked'
    if (invocation.status === 'running' && invocation.progress?.startedAt) return 'in_progress'
    return undefined
}

@CommandHandler(ProjectRuntimeObservationCommand)
export class ProjectRuntimeObservationHandler implements ICommandHandler<ProjectRuntimeObservationCommand> {
    constructor(private readonly dataSource: DataSource) {}
    async execute(command: ProjectRuntimeObservationCommand) {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId(),
            ownerId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !ownerId) return
        const record = await this.dataSource.getRepository(AgentInvocationEntity).findOneBy({
            id: command.invocationId,
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            ownerId: RequestContext.currentUserId()
        })
        if (!record) return
        const parsed = agentInvocationDispatchContextSchema.safeParse(record.invocation.request.dispatch)
        const reference = parsed.success ? parsed.data.projectTask : null
        if (!reference) return
        const invocation = record.invocation
        const where = {
            tenantId: record.tenantId,
            organizationId: record.organizationId,
            projectId: reference.projectId
        }
        await this.dataSource.transaction(async (manager) => {
            const project = await manager.getRepository(XpertProject).findOne({
                where: {
                    id: reference.projectId,
                    tenantId: record.tenantId,
                    organizationId: record.organizationId
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!project || project.status === 'archived') return
            const attemptRepo = manager.getRepository(XpertProjectTaskExecution)
            const attempt = await attemptRepo.findOneBy({
                ...where,
                id: reference.taskExecutionId,
                taskId: reference.projectTaskId,
                invocationId: invocation.id
            })
            if (!attempt || attempt.projectedInvocationRevision >= invocation.revision) return
            const latest = await attemptRepo.findOne({
                where: { ...where, taskId: attempt.taskId },
                order: { attempt: 'DESC', createdAt: 'DESC' }
            })
            const taskRepo = manager.getRepository(XpertProjectTask)
            const task = await taskRepo.findOne({ where: { ...where, id: attempt.taskId }, relations: ['steps'] })
            const status = runtimeTaskStatus(invocation)
            const ordinary = task && !task.providerKey && (!task.controlKind || task.controlKind === 'ordinary')
            if (ordinary && task.kind === 'task' && task.reviewSubject && attempt.purpose?.type === 'review' &&
                sameInvocationData(reference.purpose, attempt.purpose) && latest?.id === attempt.id &&
                attempt.projectedTaskRevision === task.revision &&
                ['todo', 'in_progress', 'review', 'blocked'].includes(task.status) &&
                task.reviewSubject.implementationTaskId === attempt.purpose.implementationTaskId &&
                task.reviewSubject.implementationExecutionId === attempt.purpose.implementationExecutionId &&
                task.reviewSubject.specificationDigest === attempt.purpose.specificationDigest) {
                // A negative verdict finishes the review, while the implementation still needs a decision.
                const reviewStatus = invocation.status === 'succeeded' && invocationCanRelease(invocation)
                    ? (reviewReport(attempt.purpose, invocation.result?.text) ? 'done' : 'blocked') : status
                if (reviewStatus && task.status !== reviewStatus) {
                    const changed = await taskRepo.update({ ...where, id: task.id, revision: task.revision },
                        { status: reviewStatus, revision: task.revision + 1 })
                    if (changed.affected) attempt.projectedTaskRevision = task.revision + 1
                }
            }
            const spec =
                task &&
                projectTaskSpecificationSchema.safeParse({
                    version: 1,
                    title: task.title || task.name,
                    description: task.description ?? undefined,
                    requirements: task.requirements ?? [],
                    steps: (task.steps ?? []).map(({ stepIndex, description }) => ({ stepIndex, description }))
                })
            const currentImplementation =
                latest?.id === attempt.id &&
                ordinary &&
                task.kind === 'task' &&
                attempt.purpose?.type === 'implementation' &&
                attempt.projectedTaskRevision === task.revision &&
                ['todo', 'in_progress', 'review', 'blocked'].includes(task.status) &&
                spec?.success &&
                createProjectTaskSpecificationSnapshot(spec.data).digest === attempt.specificationSnapshot?.digest
            if (status && currentImplementation && task.status !== status) {
                // Some legacy task writers do not take the Project lock. CAS also fences their concurrent decisions.
                const changed = await taskRepo.update(
                    { id: task.id, ...where, revision: task.revision },
                    { status, revision: task.revision + 1 }
                )
                if (changed.affected) attempt.projectedTaskRevision = task.revision + 1
            }
            attempt.projectedInvocationRevision = invocation.revision
            await attemptRepo.save(attempt)
        })
    }
}
