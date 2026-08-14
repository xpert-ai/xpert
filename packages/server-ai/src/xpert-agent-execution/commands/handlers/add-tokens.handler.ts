import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionAddTokensCommand } from '../add-tokens.command'

@CommandHandler(XpertAgentExecutionAddTokensCommand)
export class XpertAgentExecutionAddTokensHandler implements ICommandHandler<XpertAgentExecutionAddTokensCommand> {
    constructor(private readonly executionService: XpertAgentExecutionService) {}

    async execute(command: XpertAgentExecutionAddTokensCommand) {
        if (
            Number.isInteger(command.tokens) &&
            command.tokens > 0 &&
            (command.usageType === undefined || command.usageType === 'estimated')
        ) {
            await this.executionService.addTokens(command.executionId, command.tokens)
        }
    }
}
