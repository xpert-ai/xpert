import { Query } from '@nestjs/cqrs'
import { FileChunk } from '../entities'

export class SearchFileChunksQuery extends Query<FileChunk[]> {
    static readonly type = '[File Understanding] Search file chunks'

    constructor(
        public readonly input: {
            fileId: string
            query?: string
            limit?: number
        }
    ) {
        super()
    }
}
