import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionRecordUsageCommand } from '../record-usage.command'

@CommandHandler(XpertAgentExecutionRecordUsageCommand)
export class XpertAgentExecutionRecordUsageHandler implements ICommandHandler<XpertAgentExecutionRecordUsageCommand> {
    constructor(private readonly executionService: XpertAgentExecutionService) {}

    async execute(command: XpertAgentExecutionRecordUsageCommand) {
        if (
            Number.isInteger(command.usage.tokens) &&
            command.usage.tokens > 0 &&
            (command.usage.type === undefined || command.usage.type === 'estimated')
        ) {
            await this.executionService.recordUsage(command.executionId, command.usage)
        }
    }
}
