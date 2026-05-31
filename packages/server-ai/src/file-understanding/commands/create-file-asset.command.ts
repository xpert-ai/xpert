import { IStorageFile } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { FileUploadUnderstandingOptions } from '../domain/types'
import { FileAsset } from '../entities'

export class CreateFileAssetCommand extends Command<FileAsset> {
    static readonly type = '[File Understanding] Create file asset'

    constructor(
        public readonly input: FileUploadUnderstandingOptions & {
            storageFile?: IStorageFile
            storageFileId?: string
            uploadedFile?: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size' | 'buffer'>
        }
    ) {
        super()
    }
}
