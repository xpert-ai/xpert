import { Query } from '@nestjs/cqrs'
import { FileChunk } from '../entities'

export class ReadFileChunkQuery extends Query<FileChunk | null> {
    static readonly type = '[File Understanding] Read file chunk'

    constructor(
        public readonly input: {
            fileId: string
            chunkId?: string
            orderNo?: number
        }
    ) {
        super()
    }
}
