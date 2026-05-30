import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createPageImagePreviewFile } from '../../domain/page-image-artifact'
import { FileArtifact, FileAsset, FileChunk } from '../../entities'
import { GetFilePreviewQuery } from '../get-file-preview.query'

const FILE_PREVIEW_SUMMARY_LIMIT = 900
const FILE_PREVIEW_ARTIFACT_LIMIT = 12
const FILE_PREVIEW_CHUNK_LIMIT = 8

@QueryHandler(GetFilePreviewQuery)
export class GetFilePreviewHandler implements IQueryHandler<GetFilePreviewQuery> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        @InjectRepository(FileChunk)
        private readonly fileChunkRepository: Repository<FileChunk>
    ) {}

    async execute(query: GetFilePreviewQuery) {
        // Select only fields safe for small previews; content-heavy fields live
        // behind read/search queries to keep LLM context and API responses lean.
        const file = await this.fileAssetRepository.findOne({
            where: { id: query.fileAssetId },
            select: {
                id: true,
                storageFileId: true,
                originalName: true,
                mimeType: true,
                size: true,
                status: true,
                capabilities: true,
                workspacePath: true,
                summary: true,
                error: true,
                parsedAt: true,
                failedAt: true,
                metadata: true
            }
        })
        if (!file) {
            return null
        }
        const [artifacts, chunks] = await Promise.all([
            this.fileArtifactRepository.find({
                where: { fileAssetId: query.fileAssetId },
                select: {
                    kind: true,
                    orderNo: true,
                    mimeType: true,
                    anchor: true,
                    metadata: true
                },
                order: { orderNo: 'ASC' },
                take: FILE_PREVIEW_ARTIFACT_LIMIT + 1
            }),
            this.fileChunkRepository.find({
                where: { fileAssetId: query.fileAssetId },
                select: {
                    id: true,
                    orderNo: true,
                    anchor: true,
                    tokenCount: true
                },
                order: { orderNo: 'ASC' },
                take: FILE_PREVIEW_CHUNK_LIMIT
            })
        ])
        return {
            file: {
                id: file.id,
                storageFileId: file.storageFileId,
                originalName: file.originalName,
                mimeType: file.mimeType,
                size: file.size,
                status: file.status,
                capabilities: file.capabilities,
                workspacePath: file.workspacePath,
                summary: file.summary ? truncateText(file.summary, FILE_PREVIEW_SUMMARY_LIMIT) : undefined,
                error: file.error,
                parsedAt: file.parsedAt,
                failedAt: file.failedAt,
                metadata: compactMetadata(file.metadata)
            },
            artifacts: artifacts
                .filter((artifact) => artifact.kind !== 'summary')
                .slice(0, FILE_PREVIEW_ARTIFACT_LIMIT)
                .map((artifact) => {
                    const file =
                        artifact.kind === 'page_image' ? createPageImagePreviewFile(artifact.metadata) : undefined
                    return {
                        kind: artifact.kind,
                        orderNo: artifact.orderNo,
                        mimeType: artifact.mimeType,
                        anchor: artifact.anchor,
                        ...(file ? { file } : {})
                    }
                }),
            chunks: chunks.map((chunk) => ({
                chunkId: chunk.id,
                orderNo: chunk.orderNo,
                anchor: chunk.anchor,
                tokenCount: chunk.tokenCount
            }))
        }
    }
}

function truncateText(text: string, maxLength: number) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

function compactMetadata(metadata?: Record<string, unknown>) {
    if (!metadata) {
        return undefined
    }

    const compact = {
        parser: metadata.parser,
        chunkCount: metadata.chunkCount,
        fileCount: metadata.fileCount,
        pdfPageImages: metadata.pdfPageImages
    }
    return Object.values(compact).some((value) => value !== undefined) ? compact : undefined
}
