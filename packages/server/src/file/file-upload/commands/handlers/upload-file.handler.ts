import { IFileAsset } from '@metad/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UploadFileCommand } from '../../upload-file.command'
import { UploadFileService } from '../../upload-file.service'

@CommandHandler(UploadFileCommand)
export class UploadFileHandler implements ICommandHandler<UploadFileCommand> {
	constructor(private readonly service: UploadFileService) {}

	async execute(command: UploadFileCommand): Promise<IFileAsset> {
		return this.service.upload(command.input)
	}
}
