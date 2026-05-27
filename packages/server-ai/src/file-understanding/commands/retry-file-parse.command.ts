import { Command } from '@nestjs/cqrs'
import { FileAsset } from '../entities'

export class RetryFileParseCommand extends Command<FileAsset> {
    static readonly type = '[File Understanding] Retry file parse'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
