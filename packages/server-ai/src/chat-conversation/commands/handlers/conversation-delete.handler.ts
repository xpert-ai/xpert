import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationDeleteCommand } from '../conversation-delete.command'

@CommandHandler(ChatConversationDeleteCommand)
export class ChatConversationDeleteHandler implements ICommandHandler<ChatConversationDeleteCommand> {
	constructor(
		private readonly service: ChatConversationService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: ChatConversationDeleteCommand): Promise<any> {
		return await this.service.delete(command.conditions)
	}
}
