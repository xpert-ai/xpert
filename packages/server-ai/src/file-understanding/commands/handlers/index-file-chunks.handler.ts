import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileArtifactKind } from '../../domain/types'
import { FileArtifact, FileAsset, FileChunk, FileCitationAnchor, FileEmbedding } from '../../entities'
import { FileUnderstandingVectorService } from '../../file-understanding-vector.service'
import { estimateTokenCount } from '../../parsers'
import { IndexFileChunksCommand } from '../index-file-chunks.command'

const DEFAULT_CHUNK_SIZE = 3600
const DEFAULT_CHUNK_OVERLAP = 240
const CHUNKABLE_ARTIFACT_KINDS: FileArtifactKind[] = [
    'text',
    'page_text',
    'sheet',
    'slide',
    'table',
    'code_tree',
    'file_manifest',
    'ocr_text'
]

@CommandHandler(IndexFileChunksCommand)
export class IndexFileChunksHandler implements ICommandHandler<IndexFileChunksCommand> {
    readonly #logger = new Logger(IndexFileChunksHandler.name)

    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        @InjectRepository(FileChunk)
        private readonly fileChunkRepository: Repository<FileChunk>,
        @InjectRepository(FileCitationAnchor)
        private readonly fileCitationAnchorRepository: Repository<FileCitationAnchor>,
        @InjectRepository(FileEmbedding)
        private readonly fileEmbeddingRepository: Repository<FileEmbedding>,
        private readonly fileVectorService: FileUnderstandingVectorService
    ) {}

    async execute(command: IndexFileChunksCommand) {
        this.#logger.debug(`[FILE_VECTOR_DEBUG][index-handler:called] fileAssetId=${command.fileAssetId}`)
        const asset = await this.fileAssetRepository.findOneByOrFail({ id: command.fileAssetId })
        await this.fileVectorService.deleteFileVectors(command.fileAssetId, asset)
        await this.fileCitationAnchorRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileEmbeddingRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileChunkRepository.delete({ fileAssetId: command.fileAssetId })
        const artifacts = await this.fileArtifactRepository.find({
            where: { fileAssetId: command.fileAssetId },
            order: { orderNo: 'ASC' }
        })
        const chunks: FileChunk[] = []
        for (const artifact of artifacts) {
            if (!artifact.content?.trim() || !CHUNKABLE_ARTIFACT_KINDS.includes(artifact.kind)) {
                continue
            }
            for (const part of this.chunkText(artifact.content)) {
                chunks.push(
                    this.fileChunkRepository.create({
                        tenantId: artifact.tenantId,
                        organizationId: artifact.organizationId,
                        fileAssetId: command.fileAssetId,
                        artifactId: artifact.id,
                        orderNo: chunks.length,
                        content: part,
                        tokenCount: estimateTokenCount(part),
                        anchor: {
                            ...(artifact.anchor ?? {}),
                            chunk: chunks.length
                        },
                        metadata: {
                            artifactKind: artifact.kind,
                            ...(artifact.metadata ?? {})
                        }
                    })
                )
            }
        }
        const savedChunks = await this.fileChunkRepository.save(chunks)
        await this.rebuildCitationAnchors(asset, savedChunks)
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][index-handler:chunks] fileAssetId=${command.fileAssetId} artifacts=${artifacts.length} chunks=${savedChunks.length}`
        )
        await this.fileVectorService.indexChunks(asset, savedChunks)
        return savedChunks
    }

    private chunkText(content: string) {
        const text = content.trim()
        if (text.length <= DEFAULT_CHUNK_SIZE) {
            return [text]
        }
        const chunks: string[] = []
        let offset = 0
        while (offset < text.length) {
            const end = Math.min(offset + DEFAULT_CHUNK_SIZE, text.length)
            chunks.push(text.slice(offset, end))
            if (end === text.length) {
                break
            }
            offset = Math.max(end - DEFAULT_CHUNK_OVERLAP, offset + 1)
        }
        return chunks
    }

    private async rebuildCitationAnchors(asset: FileAsset, chunks: FileChunk[]) {
        if (!chunks.length) {
            return []
        }
        return await this.fileCitationAnchorRepository.save(
            chunks.map((chunk) =>
                this.fileCitationAnchorRepository.create({
                    tenantId: chunk.tenantId,
                    organizationId: chunk.organizationId,
                    fileAssetId: asset.id,
                    artifactId: chunk.artifactId,
                    chunkId: chunk.id,
                    anchorKey: this.createAnchorKey(chunk),
                    label: this.createAnchorLabel(chunk),
                    locator: chunk.anchor,
                    metadata: chunk.metadata
                })
            )
        )
    }

    private createAnchorKey(chunk: FileChunk) {
        const anchor = chunk.anchor ?? {}
        if (anchor.page) {
            return `page:${anchor.page}:chunk:${chunk.orderNo}`
        }
        if (anchor.sheet) {
            return `sheet:${anchor.sheet}:chunk:${chunk.orderNo}`
        }
        if (anchor.slide) {
            return `slide:${anchor.slide}:chunk:${chunk.orderNo}`
        }
        if (anchor.path) {
            return `path:${anchor.path}:chunk:${chunk.orderNo}`
        }
        return `chunk:${chunk.orderNo}`
    }

    private createAnchorLabel(chunk: FileChunk) {
        const anchor = chunk.anchor ?? {}
        if (anchor.page) {
            return `Page ${anchor.page}`
        }
        if (anchor.sheet) {
            return `Sheet ${anchor.sheet}`
        }
        if (anchor.slide) {
            return `Slide ${anchor.slide}`
        }
        if (anchor.path) {
            return anchor.path
        }
        return `Chunk ${chunk.orderNo}`
    }
}
