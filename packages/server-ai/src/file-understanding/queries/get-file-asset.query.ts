import { Query } from '@nestjs/cqrs'
import { FileAsset } from '../entities'

export class GetFileAssetQuery extends Query<FileAsset | null> {
    static readonly type = '[File Understanding] Get file asset'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
