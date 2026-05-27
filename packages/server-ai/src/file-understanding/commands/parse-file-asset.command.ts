import { Command } from '@nestjs/cqrs'
import { FileAsset } from '../entities'

export class ParseFileAssetCommand extends Command<FileAsset> {
    static readonly type = '[File Understanding] Parse file asset'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
