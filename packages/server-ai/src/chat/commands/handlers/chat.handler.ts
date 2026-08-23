import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import { XpertChatCommand } from '../../../xpert'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommand } from '../chat.command'

@CommandHandler(ChatCommand)
export class ChatCommandHandler implements ICommandHandler<ChatCommand> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: ChatCommand): Promise<Observable<MessageEvent>> {
        // Project conversations use the project supervisor so the task ledger,
        // execution tracking, and assistant handoff tools are available. Keep
        // standalone Xpert conversations on the Xpert-specific execution path.
        const isProjectConversation =
            Boolean(command.options.projectId) || ('projectId' in command.request && Boolean(command.request.projectId))
        if (command.options.xpertId && !isProjectConversation) {
            return await this.commandBus.execute(new XpertChatCommand(command.request, command.options))
        }
        return await this.commandBus.execute(new ChatCommonCommand(command.request, command.options))
    }
}
