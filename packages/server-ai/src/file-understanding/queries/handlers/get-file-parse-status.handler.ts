import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileAsset } from '../../entities'
import { GetFileParseStatusQuery } from '../get-file-parse-status.query'

@QueryHandler(GetFileParseStatusQuery)
export class GetFileParseStatusHandler implements IQueryHandler<GetFileParseStatusQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly repository: Repository<FileAsset>
    ) {}

    async execute(query: GetFileParseStatusQuery) {
        const file = await this.repository.findOne({ where: { id: query.fileAssetId } })
        if (!file) {
            throw new NotFoundException(`File asset "${query.fileAssetId}" not found`)
        }
        return {
            fileId: file.id,
            status: file.status,
            error: file.error,
            parsedAt: file.parsedAt
        }
    }
}
