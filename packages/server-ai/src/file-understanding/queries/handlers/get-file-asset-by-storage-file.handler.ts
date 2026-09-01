import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { FileAsset } from '../../entities'
import { GetFileAssetByStorageFileQuery } from '../get-file-asset-by-storage-file.query'

@QueryHandler(GetFileAssetByStorageFileQuery)
export class GetFileAssetByStorageFileHandler implements IQueryHandler<GetFileAssetByStorageFileQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly repository: Repository<FileAsset>
    ) {}

    execute(query: GetFileAssetByStorageFileQuery) {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) {
            return null
        }
        return this.repository.findOne({ where: { storageFileId: query.storageFileId, tenantId } })
    }
}
