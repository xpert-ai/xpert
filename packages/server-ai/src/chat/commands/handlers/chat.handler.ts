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
		if (command.request.xpertId) {
			return await this.commandBus.execute(new XpertChatCommand(command.request, command.options))
		}

		return await this.commandBus.execute(new ChatCommonCommand(command.request, command.options))
	}
}
