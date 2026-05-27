import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileAsset } from '../../entities'
import { GetFileWorkspacePathQuery } from '../get-file-workspace-path.query'

@QueryHandler(GetFileWorkspacePathQuery)
export class GetFileWorkspacePathHandler implements IQueryHandler<GetFileWorkspacePathQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly repository: Repository<FileAsset>
    ) {}

    async execute(query: GetFileWorkspacePathQuery) {
        const file = await this.repository.findOne({ where: { id: query.fileAssetId } })
        return file?.workspacePath ?? null
    }
}
