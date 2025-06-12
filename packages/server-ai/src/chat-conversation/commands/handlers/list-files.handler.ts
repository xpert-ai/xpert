import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ListConvFilesCommand } from '../list-files.command'

@CommandHandler(ListConvFilesCommand)
export class ListConvFilesHandler implements ICommandHandler<ListConvFilesCommand> {
	readonly #logger = new Logger(ListConvFilesHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: ChatConversationService
	) {}

	public async execute(command: ListConvFilesCommand) {
		const conversation = await this.service.findOne(command.conversationId, { relations: ['attachments'] })
		return conversation.attachments
	}
}
