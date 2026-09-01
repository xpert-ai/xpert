import { FileStorage, StorageFile } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { GetOwnedStorageFileQuery } from '../../../file-understanding/queries/get-owned-storage-file.query'
import { LoadFileCommand } from '../load-file.command'
import { LoadStorageFileCommand } from '../load-storage-file.command'

/**
 * @deprecated Use file-understanding parser/query services for new code. This
 * handler only bridges older StorageFile-based knowledge/document callers.
 */
@CommandHandler(LoadStorageFileCommand)
export class LoadStorageFileHandler implements ICommandHandler<LoadStorageFileCommand> {
    readonly #logger = new Logger(LoadStorageFileHandler.name)

    constructor(private readonly queryBus: QueryBus) {}

    public async execute(command: LoadStorageFileCommand) {
        const { id } = command

        const storageFile = await this.queryBus.execute<GetOwnedStorageFileQuery, StorageFile>(
            new GetOwnedStorageFileQuery(id)
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
