import { Command } from '@nestjs/cqrs'
import { FileChunk } from '../entities'

export class IndexFileChunksCommand extends Command<FileChunk[]> {
    static readonly type = '[File Understanding] Index file chunks'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
