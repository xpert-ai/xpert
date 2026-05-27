import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileArtifactKind } from '../../domain/types'
import { FileArtifact, FileChunk } from '../../entities'
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
    constructor(
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        @InjectRepository(FileChunk)
        private readonly fileChunkRepository: Repository<FileChunk>
    ) {}

    async execute(command: IndexFileChunksCommand) {
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
        return this.fileChunkRepository.save(chunks)
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
}
