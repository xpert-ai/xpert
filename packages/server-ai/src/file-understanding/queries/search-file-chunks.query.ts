import { Query } from '@nestjs/cqrs'
import type { FileChunk } from '../entities'

export class SearchFileChunksQuery extends Query<FileChunk[]> {
    static readonly type = '[File Understanding] Search file chunks'

    constructor(
        public readonly input: {
            fileId: string
            query?: string
            limit?: number
            /** Zero-based parser-order offset used only for bounded chunk paging. */
            offset?: number
        }
    ) {
        super()
    }
}
