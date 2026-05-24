import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileChunk } from '../../entities'
import { ReadFileChunkQuery } from '../read-file-chunk.query'

@QueryHandler(ReadFileChunkQuery)
export class ReadFileChunkHandler implements IQueryHandler<ReadFileChunkQuery> {
    constructor(
        @InjectRepository(FileChunk)
        private readonly repository: Repository<FileChunk>
    ) {}

    execute(query: ReadFileChunkQuery) {
        if (query.input.chunkId) {
            return this.repository.findOne({
                where: {
                    id: query.input.chunkId,
                    fileAssetId: query.input.fileId
                }
            })
        }
        return this.repository.findOne({
            where: {
                fileAssetId: query.input.fileId,
                orderNo: query.input.orderNo ?? 0
            }
        })
    }
}
