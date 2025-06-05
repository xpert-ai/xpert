import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationService } from '../../conversation.service'
import { ConvFileGetByPathCommand } from '../file-get-by-path.command'
import { LoadStorageFileCommand } from '../../../shared'
import { TFile } from '@metad/contracts'
import { Document } from 'langchain/document'

@CommandHandler(ConvFileGetByPathCommand)
export class ConvFileGetByPathCommandHandler implements ICommandHandler<ConvFileGetByPathCommand> {
	constructor(
		private readonly service: ChatConversationService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: ConvFileGetByPathCommand): Promise<TFile> {
		const conversation = await this.service.findOne(command.id, { relations: ['attachments'] })
		const storageFile = conversation.attachments.find((_) => _.originalName === command.path)
		if (storageFile) {
			const docs = await this.commandBus.execute<LoadStorageFileCommand, Document[]>(
				new LoadStorageFileCommand(storageFile.id)
			)
			return {
				filePath: command.path,
				contents: docs.map((doc) => doc.pageContent).join('\n\n'),
				url: storageFile.fileUrl,
				fileType: storageFile.mimetype,
				size: storageFile.size,
				description: ''
			}
		}
	}
}
