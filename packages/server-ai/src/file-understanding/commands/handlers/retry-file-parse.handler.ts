import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RetryFileParseCommand } from '../retry-file-parse.command'
import { ParseFileAssetCommand } from '../parse-file-asset.command'

@CommandHandler(RetryFileParseCommand)
export class RetryFileParseHandler implements ICommandHandler<RetryFileParseCommand> {
    constructor(private readonly commandBus: CommandBus) {}

    execute(command: RetryFileParseCommand) {
        return this.commandBus.execute(new ParseFileAssetCommand(command.fileAssetId))
    }
}
