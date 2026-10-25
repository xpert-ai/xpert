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
        const task = await this.runtime.getTaskStatus({
            executionId: target.currentExecutionId,
            threadId: target.threadId
        })
        if (!task) return { status: 'unknown' }
        if (action === 'cancel' && target.state !== 'completed')
            await this.runtime.cancelTask({ executionId: target.currentExecutionId, threadId: target.threadId })
        const current = await this.tasks.read(target.id)
        if (current.state === 'paused') return { status: 'waiting' }
        if (current.state !== 'completed') return { status: action === 'cancel' ? 'cancelling' : 'running' }
        if (task.status === 'succeeded') return { status: 'succeeded', result: { text: '', data: { ...task } } }
        if (task.status === 'failed') return { status: 'failed', error: task.errorMessage }
        return { status: (await this.tasks.desired(target.id)) === 'terminated' ? 'cancelled' : 'unknown' }
    }
}
