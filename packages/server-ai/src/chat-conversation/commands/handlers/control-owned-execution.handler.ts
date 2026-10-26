import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource, IsNull } from 'typeorm'
import { TaskControlStore } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ThreadRunControlService } from '../../thread-run-control.service'
import { ChatConversationThread } from '../../conversation-thread.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { RunCreateStreamCommand } from '../../../ai/commands/run-create-stream.command'
import { ControlOwnedExecutionCommand } from '../control-owned-execution.command'

@CommandHandler(ControlOwnedExecutionCommand)
export class ControlOwnedExecutionHandler implements ICommandHandler<ControlOwnedExecutionCommand> {
    constructor(
        private readonly tasks: TaskControlStore,
        private readonly database: DataSource,
        private readonly control: ThreadRunControlService,
        private readonly commands: CommandBus
    ) {}
    async execute({ targetId }: ControlOwnedExecutionCommand) {
        const task = await this.tasks.read(targetId)
        if (!task || task.kind !== 'execution' || task.drainOnPause || !task.currentExecutionId) return
        if (
            task.tenantId !== RequestContext.currentTenantId() ||
            task.organizationId !== (RequestContext.getOrganizationId() ?? null)
        )
            throw new Error('Execution control scope mismatch')
        const scope = { tenantId: task.tenantId, organizationId: task.organizationId ?? IsNull() }
        const thread = await this.database.manager.findOneBy(ChatConversationThread, {
            ...scope,
            threadId: task.threadId
        })
        if (thread?.runControl?.executionId !== task.currentExecutionId) return
        const desired = await this.tasks.desired(task.id)
        if (desired === 'terminated') {
            await this.control.cancel(task.threadId, [task.currentExecutionId])
            return
        }
        if (desired === 'paused' && thread.runControl.state === 'running') {
            await this.control.requestPause(task.threadId, task.currentExecutionId, true)
            return
        }
        if (desired === 'running' && task.parentId && task.state === 'paused' && thread.runControl.state === 'paused') {
            const execution = await this.database.manager.findOneByOrFail(XpertAgentExecution, {
                ...scope,
                id: task.currentExecutionId
            })
            const { stream } = await this.commands.execute(
                new RunCreateStreamCommand(
                    task.threadId,
                    {
                        assistant_id: execution.xpertId,
                        stream_mode: ['values'],
                        stream_subgraphs: true,
                        on_disconnect: 'continue',
                        multitask_strategy: 'reject',
                        if_not_exists: 'reject',
                        input: {
                            action: 'resume',
                            target: { executionId: execution.id },
                            decision: { type: 'confirm' }
                        }
                    },
                    { executionId: execution.id, pauseId: thread.runControl.pauseId }
                )
            )
            // The command owns admission and the resume token. A failed/ambiguous start is never retried as new input.
            stream.subscribe({ error: () => undefined })
        }
    }
}
