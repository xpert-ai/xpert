import { Query } from '@nestjs/cqrs'
import type { StorageFile } from '@xpert-ai/server-core'

/** Owner-authorized compatibility lookup for legacy StorageFile handles. */
export class GetOwnedStorageFileQuery extends Query<StorageFile> {
    static readonly type = '[File Understanding] Get owned storage file'

    constructor(public readonly storageFileId: string) {
        super()
    }
}
