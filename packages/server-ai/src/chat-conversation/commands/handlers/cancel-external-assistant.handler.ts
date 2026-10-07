// Cancel only the selected invocation subtree. The parent conversation remains running.
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Logger, Optional } from '@nestjs/common'
import { IXpertAgentExecution, XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ExecutionCancelService } from '../../../shared/execution/execution-cancel.service'
import { XpertAgentExecutionService } from '../../../xpert-agent-execution/agent-execution.service'
import { DesktopShellOperationService } from '../../../desktop-shell/desktop-shell-operation.service'
import { StopHandoffMessageCommand } from '../../../handoff/commands'
import { CancelExternalAssistantCommand } from '../cancel-external-assistant.command'

@CommandHandler(CancelExternalAssistantCommand)
export class CancelExternalAssistantHandler implements ICommandHandler<CancelExternalAssistantCommand> {
    private readonly logger = new Logger(CancelExternalAssistantHandler.name)

    constructor(
        private readonly executions: XpertAgentExecutionService,
        private readonly cancellations: ExecutionCancelService,
        private readonly commands: CommandBus,
        @Optional() private readonly desktopShell?: DesktopShellOperationService
    ) {}

    async execute({ execution }: CancelExternalAssistantCommand) {
        if (execution.metadata?.invocationKind !== 'external_assistant' || execution.status !== Status.RUNNING) {
            return { canceledExecutionIds: [] }
        }
        const descendants: IXpertAgentExecution[] = [execution]
        const visited = new Set([execution.id])
        for (let index = 0; index < descendants.length; index++) {
            const children = await this.executions.findAllByParentId(descendants[index].id)
            for (const child of children) {
                if (child.threadId === execution.threadId && !visited.has(child.id)) {
                    visited.add(child.id)
                    descendants.push(child)
                }
            }
        }
        const ids = descendants.filter((item) => item.status === Status.RUNNING).map((item) => item.id)
        const reason = t('server-ai:Error.ExternalAssistantCancelledByUser', {
            defaultValue:
                'This external assistant execution was cancelled by the user. Do not retry without a new user request.'
        })
        await this.cancellations.cancelExecutions(ids, reason)
        // Do not change a completed execution if it won the race with the cancel request.
        await this.executions.interruptRunning(ids, execution.threadId, reason)
        await this.desktopShell?.cancelRuns(ids)
        try {
            await this.commands.execute(new StopHandoffMessageCommand({ executionIds: ids, reason }))
        } catch (error) {
            this.logger.warn(`Failed to stop cancelled expert handoffs: ${error}`)
        }
        return { canceledExecutionIds: ids }
    }
}
