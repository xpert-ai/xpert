import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { type FindOptionsWhere, Repository } from 'typeorm'
import { FileAsset, FileChunk, FileEmbedding } from '../../entities'
import {
    GetFileUnderstandingStatusQuery,
    type FileUnderstandingStatusResult
} from '../get-file-understanding-status.query'

@QueryHandler(GetFileUnderstandingStatusQuery)
export class GetFileUnderstandingStatusHandler implements IQueryHandler<GetFileUnderstandingStatusQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly assetRepository: Repository<FileAsset>,
        @InjectRepository(FileChunk)
        private readonly chunkRepository: Repository<FileChunk>,
        @InjectRepository(FileEmbedding)
        private readonly embeddingRepository: Repository<FileEmbedding>
    ) {}

    async execute(query: GetFileUnderstandingStatusQuery): Promise<FileUnderstandingStatusResult> {
        const file = await this.assetRepository.findOne({
            where: scopedFileWhere(query.fileAssetId, query.scope)
        })
        if (!file) {
            throw new NotFoundException('File understanding asset was not found in the current scope')
        }
        const [chunkCount, indexedChunkCount] = await Promise.all([
            this.chunkRepository.count({ where: { fileAssetId: file.id } }),
            this.embeddingRepository.count({ where: { fileAssetId: file.id } })
        ])
        return {
            fileAssetId: file.id,
            status: file.status,
            parseMode: file.parseMode,
            capabilities: file.capabilities ?? [],
            chunkCount,
            indexedChunkCount,
            vectorIndexStatus: resolveVectorStatus(file, chunkCount, indexedChunkCount),
            ...(readErrorCode(file.metadata) ? { errorCode: readErrorCode(file.metadata) } : {}),
            ...(file.parsedAt ? { parsedAt: file.parsedAt } : {})
        }
    }
}

export function scopedFileWhere(
    id: string,
    scope: GetFileUnderstandingStatusQuery['scope']
): FindOptionsWhere<FileAsset> {
    return {
        id,
        tenantId: scope.tenantId,
        ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(scope.xpertId ? { xpertId: scope.xpertId } : {})
    }
}

function resolveVectorStatus(file: FileAsset, chunkCount: number, indexedChunkCount: number) {
    if (file.status === 'failed') return 'failed' as const
    if (file.status === 'uploaded' || file.status === 'scanning' || file.status === 'parsing') return 'pending' as const
    if (chunkCount > 0 && indexedChunkCount >= chunkCount) return 'ready' as const
    return 'unavailable' as const
}

function readErrorCode(metadata?: Record<string, unknown>) {
    const value = metadata?.understandingErrorCode
    return typeof value === 'string' && value ? value : undefined
}
