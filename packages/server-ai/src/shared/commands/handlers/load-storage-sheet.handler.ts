import { FileStorage, GetStorageFileQuery, StorageFile } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { loadCsvWithAutoEncoding, loadExcel } from '@metad/server-common'
import { LoadStorageSheetCommand } from '../load-storage-sheet.command'

@CommandHandler(LoadStorageSheetCommand)
export class LoadStorageSheetHandler implements ICommandHandler<LoadStorageSheetCommand> {
	readonly #logger = new Logger(LoadStorageSheetHandler.name)

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: LoadStorageSheetCommand) {
		const { id } = command

		const [storageFile] = await this.queryBus.execute<GetStorageFileQuery, StorageFile[]>(new GetStorageFileQuery([id]))
		const path = this.getFilePath(storageFile)
		if (storageFile.file.endsWith('.csv')) {
			return loadCsvWithAutoEncoding(path)
		}

		return loadExcel(path)
	}

	getFilePath(storageFile: StorageFile) {
		const storageProvider = new FileStorage().setProvider(storageFile.storageProvider).getProviderInstance()
		const filePath = storageProvider.path(storageFile.file)
		return filePath
	}
}
