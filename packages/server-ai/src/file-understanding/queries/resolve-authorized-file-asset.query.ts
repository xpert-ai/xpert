import { Query } from '@nestjs/cqrs'
import { AuthorizedFileAsset, ResolveFileAssetAccessInput } from '../file-asset-access.service'

export class ResolveAuthorizedFileAssetQuery extends Query<AuthorizedFileAsset> {
    static readonly type = '[File Understanding] Resolve authorized file asset'

    constructor(public readonly input: ResolveFileAssetAccessInput) {
        super()
    }
}
