import { FileStorage, GetStorageFileQuery, StorageFile } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { LoadFileCommand } from '../load-file.command'
import { LoadStorageFileCommand } from '../load-storage-file.command'

/**
 * @deprecated use LoadFileCommand instead
 */
@CommandHandler(LoadStorageFileCommand)
export class LoadStorageFileHandler implements ICommandHandler<LoadStorageFileCommand> {
	readonly #logger = new Logger(LoadStorageFileHandler.name)

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: LoadStorageFileCommand) {
		const { id } = command

		const [storageFile] = await this.queryBus.execute<GetStorageFileQuery, StorageFile[]>(
			new GetStorageFileQuery([id])
		)

		return await this.queryBus.execute<LoadFileCommand, Document[]>(
			new LoadFileCommand({
				filePath: this.getFilePath(storageFile),
				mimeType: storageFile.mimetype
			})
		)
	}

	getFilePath(storageFile: StorageFile) {
		const storageProvider = new FileStorage().setProvider(storageFile.storageProvider).getProviderInstance()
		const filePath = storageProvider.path(storageFile.file)
		return filePath
	}
}
