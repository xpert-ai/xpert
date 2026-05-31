import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileAsset } from '../../entities'
import { GetFileAssetQuery } from '../get-file-asset.query'

@QueryHandler(GetFileAssetQuery)
export class GetFileAssetHandler implements IQueryHandler<GetFileAssetQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly repository: Repository<FileAsset>
    ) {}

    execute(query: GetFileAssetQuery) {
        return this.repository.findOne({ where: { id: query.fileAssetId } })
    }
}
