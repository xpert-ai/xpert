import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { TaskControlStore } from '@xpert-ai/server-core'
import { RequestContext, AgentRuntimeObservation } from '@xpert-ai/plugin-sdk'
import { AssistantTaskRuntimeService } from './assistant-task-runtime.service'
import { ControlAssistantTaskCommand } from './control-assistant-task.command'

@CommandHandler(ControlAssistantTaskCommand)
export class ControlAssistantTaskHandler implements ICommandHandler<ControlAssistantTaskCommand> {
    constructor(
        private readonly runtime: AssistantTaskRuntimeService,
        private readonly tasks: TaskControlStore
    ) {}
    async execute({ executionId, action }: ControlAssistantTaskCommand): Promise<AgentRuntimeObservation> {
        const target = await this.tasks.execution(executionId)
        if (
            !target ||
            target.tenantId !== RequestContext.currentTenantId() ||
            target.organizationId !== (RequestContext.getOrganizationId() ?? null)
        )
            throw new Error('Assistant task control scope mismatch')
        let task = await this.runtime.getTaskStatus({ executionId, threadId: target.threadId })
        if (!task) return { status: 'unknown' }
        if (action === 'cancel' && task.control?.state !== 'settled') {
            await this.runtime.cancelTask({ executionId, threadId: target.threadId })
            task = await this.runtime.getTaskStatus({ executionId, threadId: target.threadId })
            if (!task) return { status: 'unknown' }
        }
        const controlEvidence = task.control
        if (controlEvidence?.state === 'paused') return { status: 'waiting', controlEvidence }
        if (controlEvidence?.state !== 'settled')
            return {
                status: action === 'cancel' || controlEvidence?.state === 'terminating' ? 'cancelling' : 'running',
                controlEvidence
            }
        if (task.status === 'succeeded')
            return { status: 'succeeded', controlEvidence, result: { text: '', data: { ...task } } }
        if (task.status === 'failed') return { status: 'failed', controlEvidence, error: task.errorMessage }
        return {
            status:
                controlEvidence.source === 'platform' && controlEvidence.desired === 'terminated'
                    ? 'cancelled'
                    : 'unknown',
            controlEvidence
        }
    }
}
