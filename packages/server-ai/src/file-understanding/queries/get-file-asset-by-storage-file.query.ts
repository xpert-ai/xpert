import { Query } from '@nestjs/cqrs'
import type { FileAsset } from '../entities'

export class GetFileAssetByStorageFileQuery extends Query<FileAsset | null> {
    static readonly type = '[File Understanding] Get file asset by storage file'

    constructor(public readonly storageFileId: string) {
        super()
    }
}
