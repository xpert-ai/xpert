import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { FileAssetAccessService } from '../../file-asset-access.service'
import { GetOwnedStorageFileQuery } from '../get-owned-storage-file.query'

@QueryHandler(GetOwnedStorageFileQuery)
export class GetOwnedStorageFileHandler implements IQueryHandler<GetOwnedStorageFileQuery> {
    constructor(private readonly fileAssetAccessService: FileAssetAccessService) {}

    execute(query: GetOwnedStorageFileQuery) {
        return this.fileAssetAccessService.assertStorageFileOwner(query.storageFileId)
    }
}
