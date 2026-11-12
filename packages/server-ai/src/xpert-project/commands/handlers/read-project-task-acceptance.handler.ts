// Read one consistent snapshot of recorded acceptance. Never reconcile invocations,
// schedule work, or impose a delivery plugin's required review mode or verdict.
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { projectTaskDecisionSchema } from '@xpert-ai/contracts'
import { RequestContext, type ProjectTaskAcceptanceReceipt } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { sameInvocationData } from '../../../agent-invocation/invocation-runtime'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { implementationEvidence, reviewReport, taskSpecification } from '../../runtime/project-task-evidence'
import { projectTaskRuntimeError } from '../../runtime/project-task-runtime.errors'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { assertOrdinaryTask } from '../../services/project-task-ownership'
import { ReadProjectTaskAcceptanceCommand } from '../read-project-task-acceptance.command'

@CommandHandler(ReadProjectTaskAcceptanceCommand)
export class ReadProjectTaskAcceptanceHandler implements ICommandHandler<ReadProjectTaskAcceptanceCommand> {
    constructor(
        @InjectRepository(XpertProjectTask) private readonly tasks: Repository<XpertProjectTask>,
        private readonly access: XpertProjectAccessService
    ) {}

    async execute({ context: { actor, projectId }, taskId }: ReadProjectTaskAcceptanceCommand): Promise<ProjectTaskAcceptanceReceipt | null> {
        if (!actor.organizationId || RequestContext.currentUserId() !== actor.userId ||
            RequestContext.currentTenantId() !== actor.tenantId || RequestContext.getOrganizationId() !== actor.organizationId)
            throw projectTaskRuntimeError('Scope')
        await this.access.assertCanRead(projectId)
        return this.tasks.manager.transaction('REPEATABLE READ', async (manager) => {
            const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId, projectId }
            const tasks = manager.getRepository(XpertProjectTask)
            const executions = manager.getRepository(XpertProjectTaskExecution)
            const task = await tasks.findOne({ where: { ...scope, id: taskId }, relations: ['steps'] })
            if (!task) throw projectTaskRuntimeError('NotFound')
            assertOrdinaryTask(task)
            if (task.status !== 'done' || !task.decisions?.length) return null
            const decision = projectTaskDecisionSchema.parse(task.decisions[task.decisions.length - 1])
            if (decision.taskId !== taskId) throw projectTaskRuntimeError('Evidence')
            if (decision.outcome !== 'accept' || decision.taskRevision !== task.revision) return null

            const attempt = await executions.findOneBy({ ...scope, id: decision.implementationExecutionId, createdById: actor.userId })
            if (!attempt || attempt.purpose?.type !== 'implementation') throw projectTaskRuntimeError('Evidence')
            const implementation = attempt.taskId === task.id ? task :
                await tasks.findOne({ where: { ...scope, id: attempt.taskId }, relations: ['steps'] })
            if (!implementation) throw projectTaskRuntimeError('Evidence')
            assertOrdinaryTask(implementation)
            if (implementation.id !== task.id && (task.kind !== 'summary' || implementation.parentTaskId !== task.id ||
                attempt.purpose.coordination?.taskId !== task.id ||
                attempt.purpose.coordination.specificationDigest !== taskSpecification(task).digest))
                throw projectTaskRuntimeError('Evidence')
            const { invocation } = await implementationEvidence(manager, implementation,
                { tenantId: actor.tenantId, organizationId: actor.organizationId, userId: actor.userId },
                decision.implementationExecutionId, decision.specificationDigest, decision.evidence)
            if (invocation.status !== 'succeeded' || !invocation.scope.conversationId) throw projectTaskRuntimeError('State')

            let review: ProjectTaskAcceptanceReceipt['review'] = null
            if (decision.reviewExecutionId) {
                const execution = await executions.findOneBy({ ...scope, id: decision.reviewExecutionId, createdById: actor.userId })
                const purpose = execution?.purpose
                if (!execution?.invocationId || purpose?.type !== 'review' || execution.invocationId === invocation.id ||
                    purpose.implementationExecutionId !== attempt.id || purpose.implementationInvocationId !== invocation.id ||
                    purpose.specificationDigest !== decision.specificationDigest ||
                    !sameInvocationData(purpose.evidence, decision.evidence)) throw projectTaskRuntimeError('Evidence')
                if (execution.taskId !== implementation.id && purpose.implementationTaskId !== implementation.id)
                    throw projectTaskRuntimeError('Evidence')
                if (purpose.implementationTaskId && purpose.implementationTaskId !== implementation.id)
                    throw projectTaskRuntimeError('Evidence')
                const reviewTask = await tasks.findOneBy({ ...scope, id: execution.taskId })
                if (!reviewTask || reviewTask.status === 'cancelled') throw projectTaskRuntimeError('Evidence')
                const row = await manager.getRepository(AgentInvocationEntity).findOneBy({
                    tenantId: actor.tenantId, organizationId: actor.organizationId, id: execution.invocationId, ownerId: actor.userId
                })
                const reference = row?.invocation.request.dispatch?.projectTask
                const report = reviewReport(purpose, row?.invocation.result?.text)
                if (!row || row.invocation.status !== 'succeeded' || row.invocation.scope.projectId !== projectId ||
                    reference?.projectId !== projectId || reference.projectTaskId !== execution.taskId ||
                    reference.taskExecutionId !== execution.id || !sameInvocationData(reference.purpose, purpose) ||
                    !report || ((purpose.mode === 'execution') !== (report.version === 2))) throw projectTaskRuntimeError('Evidence')
                review = { executionId: execution.id, mode: purpose.mode ?? 'evidence_only', verdict: report.verdict }
            }
            return {
                projectId, taskId, taskRevision: task.revision, conversationId: invocation.scope.conversationId,
                decisionId: decision.requestId, review,
                artifacts: decision.evidence.flatMap((item) => item.type === 'artifact'
                    ? [{ artifactId: item.artifactId, versionId: item.versionId }] : [])
            }
        })
    }
}
