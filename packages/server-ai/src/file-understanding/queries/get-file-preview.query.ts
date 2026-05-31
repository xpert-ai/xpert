import { Query } from '@nestjs/cqrs'
import { PageImagePreviewFile } from '../domain/page-image-artifact'
import { FileAnchor, FileArtifactKind, FileAssetStatus, FileCapability } from '../domain/types'

export type FilePreviewResult = {
    file: {
        id: string
        storageFileId?: string
        originalName?: string
        mimeType?: string
        size?: number
        status: FileAssetStatus
        capabilities?: FileCapability[]
        workspacePath?: string
        summary?: string
        error?: string
        parsedAt?: Date
        failedAt?: Date
        metadata?: {
            parser?: unknown
            chunkCount?: unknown
            fileCount?: unknown
            pdfPageImages?: unknown
        }
    }
    artifacts: Array<{
        kind: FileArtifactKind
        orderNo: number
        mimeType?: string
        anchor?: FileAnchor
        file?: PageImagePreviewFile
    }>
    chunks: Array<{
        chunkId: string
        orderNo: number
        anchor?: FileAnchor
        tokenCount?: number
    }>
}

/**
 * Lightweight preview for UI and agent file cards. It deliberately omits raw
 * artifact/chunk content; use SearchFileChunksQuery or ReadFileChunkQuery for
 * actual file text.
 */
export class GetFilePreviewQuery extends Query<FilePreviewResult | null> {
    static readonly type = '[File Understanding] Get file preview'

    constructor(public readonly fileAssetId: string) {
        super()
    }
}
