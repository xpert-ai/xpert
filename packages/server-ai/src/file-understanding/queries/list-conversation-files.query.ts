import { Query } from '@nestjs/cqrs'
import type { FileAsset } from '../entities'

export class ListConversationFilesQuery extends Query<FileAsset[]> {
    static readonly type = '[File Understanding] List conversation files'

    constructor(public readonly conversationId: string) {
        super()
    }
}
