import { StorageFileCreateCommand, StorageFileService } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'

import { ChatConversationService } from '../../conversation.service'
import { ConvFileUpsertCommand } from '../upsert-file.command'

@CommandHandler(ConvFileUpsertCommand)
export class ConvFileUpsertHandler implements ICommandHandler<ConvFileUpsertCommand> {
	readonly #logger = new Logger(ConvFileUpsertHandler.name)

	constructor(
		private readonly conversationService: ChatConversationService,
		private readonly fileService: StorageFileService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ConvFileUpsertCommand) {
		const { file, id } = command

		const createdStorageFile = await this.commandBus.execute(new StorageFileCreateCommand(command.file))

		// 日志记录
		this.#logger.log(`File uploaded and saved successfully: ${createdStorageFile.id}`)

		const conv = await this.conversationService.findOne(id, { relations: ['attachments'] })
		const index = conv.attachments.findIndex((_) => _.originalName === file.filePath)
		if (index > -1) {
			conv.attachments[index] = createdStorageFile
		} else {
			conv.attachments.push(createdStorageFile)
		}
		await this.conversationService.repository.save(conv)
	}
}
