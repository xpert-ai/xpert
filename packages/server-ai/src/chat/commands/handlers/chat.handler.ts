import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import { TChatRequest } from '@xpert-ai/contracts'
import { hydrateSendRequestHumanInput } from '../../../shared/agent'
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
		const request = hydrateSendRequestHumanInput<TChatRequest>(command.request)

		if (command.options.xpertId) {
			return await this.commandBus.execute(new XpertChatCommand(request, command.options))
		}

		return await this.commandBus.execute(new ChatCommonCommand(request, command.options))
	}
}
