import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ConversationEnvironmentFilesService } from './conversation-environment-files.service'
import { ResolveConversationEnvironmentFilesCommand } from './resolve-conversation-environment-files.command'

@CommandHandler(ResolveConversationEnvironmentFilesCommand)
export class ResolveConversationEnvironmentFilesHandler implements ICommandHandler<ResolveConversationEnvironmentFilesCommand> {
    constructor(private readonly files: ConversationEnvironmentFilesService) {}

    execute({ context }: ResolveConversationEnvironmentFilesCommand) {
        return this.files.resolve(context)
    }
}
