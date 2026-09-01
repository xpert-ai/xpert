import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FileAssetAccessService } from '../../file-asset-access.service'
import { ResolveAuthorizedFileAssetQuery } from '../resolve-authorized-file-asset.query'

@QueryHandler(ResolveAuthorizedFileAssetQuery)
export class ResolveAuthorizedFileAssetHandler implements IQueryHandler<ResolveAuthorizedFileAssetQuery> {
    constructor(private readonly fileAssetAccessService: FileAssetAccessService) {}

    execute(query: ResolveAuthorizedFileAssetQuery) {
        return this.fileAssetAccessService.resolve(query.input)
    }
}
