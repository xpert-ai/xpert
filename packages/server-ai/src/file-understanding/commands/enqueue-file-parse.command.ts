import { Command } from '@nestjs/cqrs'
import { FileAsset } from '../entities'

export class EnqueueFileParseCommand extends Command<FileAsset> {
    static readonly type = '[File Understanding] Enqueue file parse'

    constructor(
        public readonly fileAssetId: string,
        public readonly options?: {
            runInline?: boolean
        }
    ) {
        super()
    }
}
