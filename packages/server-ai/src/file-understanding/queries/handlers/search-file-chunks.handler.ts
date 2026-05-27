import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, Repository } from 'typeorm'
import { FileChunk } from '../../entities'
import { SearchFileChunksQuery } from '../search-file-chunks.query'

@QueryHandler(SearchFileChunksQuery)
export class SearchFileChunksHandler implements IQueryHandler<SearchFileChunksQuery> {
    constructor(
        @InjectRepository(FileChunk)
        private readonly repository: Repository<FileChunk>
    ) {}

    execute(query: SearchFileChunksQuery) {
        const where = query.input.query?.trim()
            ? {
                  fileAssetId: query.input.fileId,
                  content: ILike(`%${query.input.query.trim()}%`)
              }
            : {
                  fileAssetId: query.input.fileId
              }
        return this.repository.find({
            where,
            order: { orderNo: 'ASC' },
            take: Math.min(Math.max(query.input.limit ?? 8, 1), 30)
        })
    }
}
