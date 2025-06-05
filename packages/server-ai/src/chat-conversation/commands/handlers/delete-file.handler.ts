import { StorageFileService } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ConvFileDeleteCommand } from '../delete-file.command'

@CommandHandler(ConvFileDeleteCommand)
export class ConvFileDeleteHandler implements ICommandHandler<ConvFileDeleteCommand> {
	readonly #logger = new Logger(ConvFileDeleteHandler.name)

	constructor(
		private readonly conversationService: ChatConversationService,
		private readonly fileService: StorageFileService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ConvFileDeleteCommand) {
		const { id, filePath } = command

		const conv = await this.conversationService.findOne(id, { relations: ['attachments'] })
		const index = conv.attachments.findIndex((_) => _.originalName === filePath)
		if (index > -1) {
			await this.fileService.delete(conv.attachments[index].id)
			conv.attachments.splice(index, 1)
			await this.conversationService.repository.save(conv)
		}
	}
}
