import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileAsset } from '../../entities'
import { GetFileAssetByStorageFileQuery } from '../get-file-asset-by-storage-file.query'

@QueryHandler(GetFileAssetByStorageFileQuery)
export class GetFileAssetByStorageFileHandler implements IQueryHandler<GetFileAssetByStorageFileQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly repository: Repository<FileAsset>
    ) {}

    execute(query: GetFileAssetByStorageFileQuery) {
        return this.repository.findOne({ where: { storageFileId: query.storageFileId } })
    }
}
