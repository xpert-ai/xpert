import { Query } from '@nestjs/cqrs'
import { FileAssetAuthority } from '../file-asset-access.service'

export class ReadFileAssetSourceQuery extends Query<Buffer | null> {
    static readonly type = '[File Understanding] Read file asset source'

    constructor(
        public readonly fileAssetId: string,
        public readonly authority: FileAssetAuthority
    ) {
        super()
    }
}
