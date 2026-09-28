import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { BadRequestException, Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import path from 'node:path'
import { RequestContext } from '@xpert-ai/server-core'
import {
    resolveFileAssetWorkspaceRelativePath,
    resolveFileAssetWorkspaceVolumeScope
} from '../../../file-understanding/domain/workspace-file'
import type { FileAsset } from '../../../file-understanding/entities/file-asset.entity'
import { ResolveAuthorizedFileAssetQuery } from '../../../file-understanding/queries/resolve-authorized-file-asset.query'
import { SearchFileChunksQuery } from '../../../file-understanding/queries/search-file-chunks.query'
import { VOLUME_CLIENT, VolumeClient } from '../../volume/volume'
import { LoadFileCommand } from '../load-file.command'
import { OfficeFileParser } from '../../../file-understanding/parsers/office.parser'
import { getFileExtension, isZipFile } from '../../../file-understanding/parsers/file-parser'
import { readTextFile, supportsTextFile } from '../../../file-understanding/parsers/text-file'
import { UnsupportedFileContentError } from '../../../file-understanding/parsers/unsupported-file-content.error'

/**
 * @deprecated Prefer FileUnderstanding tools/queries for parsed assets. This
 * handler keeps old callers working and only falls back to file loaders when a
 * FileAsset is not available.
 */
@CommandHandler(LoadFileCommand)
export class LoadFileHandler implements ICommandHandler<LoadFileCommand> {
    readonly #logger = new Logger(LoadFileHandler.name)

    constructor(
        private readonly queryBus: QueryBus,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
    ) {}

    public async execute(command: LoadFileCommand) {
        const { file } = command
        const resolved = await this.resolveFileAsset(file)
        const understoodDocs = await this.tryLoadFileUnderstandingDocs(resolved.fileAsset)
        if (understoodDocs?.length) {
            return understoodDocs
        }

        const filePath = this.resolveLocalFilePath(file.filePath, resolved.fileAsset)
        const originalName = resolved.fileAsset?.originalName ?? file.originalName
        const source = {
            filePath,
            // An extensionless display name must not mask the storage file's format.
            originalName: getFileExtension(originalName) ? originalName : path.basename(filePath),
            mimeType: resolved.fileAsset?.mimeType ?? file.mimeType
        }
        if (isZipFile(source)) throw new UnsupportedFileContentError()
        const type = getFileExtension(source.originalName ?? filePath)
        let data: Document[]
        switch (type.toLowerCase()) {
            case 'md':
            case 'mdx':
            case 'markdown':
                data = await this.processMarkdown(filePath)
                break
            case 'pdf':
                data = await this.processPdf(filePath)
                break
            case 'epub':
                data = await this.processEpub(filePath)
                break
            case 'doc':
            case 'docx':
                data = await this.processDoc(filePath, source.originalName)
                break
            case 'pptx':
                data = await this.processPPT(filePath)
                break
            case 'xlsx':
                data = await this.processExcel(filePath)
                break
            case 'odt':
            case 'ods':
            case 'odp':
                data = await this.processOpenDocument(filePath)
                break
            default:
                if (!supportsTextFile(source)) throw new UnsupportedFileContentError()
                data = await this.processText(filePath)
                break
        }

        return data
    }

    async processMarkdown(url: string): Promise<Document<Record<string, any>>[]> {
        return this.processText(url)
    }

    async processPdf(url: string): Promise<Document<Record<string, any>>[]> {
        const loader = new PDFLoader(url)
        return await loader.load()
    }

    async processEpub(url: string): Promise<Document<Record<string, any>>[]> {
        const loader = new EPubLoader(url, { splitChapters: false })
        return await loader.load()
    }

    async processDoc(filePath: string, originalName?: string): Promise<Document[]> {
        // Legacy attachment fallback must use the same format detection as File Understanding.
        const parsed = await new OfficeFileParser().parse({ filePath, ...(originalName ? { originalName } : {}) })
        return parsed.artifacts
            .filter((artifact) => artifact.kind === 'text')
            .map((artifact) => new Document({ pageContent: artifact.content ?? '', metadata: artifact.metadata ?? {} }))
    }

    async processText(url: string): Promise<Document<Record<string, any>>[]> {
        const pageContent = await readTextFile(url)
        return [new Document({ pageContent, metadata: { source: url } })]
    }

    async processPPT(url: string): Promise<Document<Record<string, any>>[]> {
        const loader = new PPTXLoader(url)
        return await loader.load()
    }

    async processExcel(url: string): Promise<Document<Record<string, any>>[]> {
        const loader = new PPTXLoader(url)
        return await loader.load()
    }
    async processOpenDocument(url: string): Promise<Document<Record<string, any>>[]> {
        const loader = new PPTXLoader(url)
        return await loader.load()
    }

    private async resolveFileAsset(file: {
        fileId?: string
        fileAssetId?: string
        storageFileId?: string
        id?: string
    }) {
        const fileAssetId = file.fileId ?? file.fileAssetId
        const storageFileId = file.storageFileId ?? file.id
        if (!fileAssetId && !storageFileId) {
            return { fileAsset: null as FileAsset | null }
        }
        const { asset } = await this.queryBus.execute(
            new ResolveAuthorizedFileAssetQuery({
                locator: fileAssetId
                    ? { fileAssetId, ...(file.storageFileId ? { storageFileId } : {}) }
                    : { storageFileId },
                authority: { kind: 'current-owner' },
                operation: 'read'
            })
        )
        return { fileAsset: (asset ?? null) as FileAsset | null }
    }

    private async tryLoadFileUnderstandingDocs(fileAsset?: FileAsset | null) {
        if (!fileAsset || !['ready', 'partial'].includes(fileAsset.status)) {
            return null
        }
        const chunks = await this.queryBus.execute<
            SearchFileChunksQuery,
            Array<{ id: string; content: string; anchor?: unknown }>
        >(new SearchFileChunksQuery({ fileId: fileAsset.id, limit: 30 }))
        if (!chunks.length) {
            return null
        }
        return chunks.map(
            (chunk) =>
                new Document({
                    pageContent: chunk.content,
                    metadata: {
                        fileId: fileAsset.id,
                        chunkId: chunk.id,
                        anchor: chunk.anchor
                    }
                })
        )
    }

    private resolveLocalFilePath(filePath?: string, fileAsset?: FileAsset | null) {
        if (filePath && path.isAbsolute(filePath)) {
            return filePath
        }
        const workspacePath = resolveFileAssetWorkspaceRelativePath(fileAsset, filePath)
        if (!workspacePath) {
            throw new BadRequestException('Workspace file path is required')
        }
        const volumeScope = resolveFileAssetWorkspaceVolumeScope(fileAsset, {
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId()
        })
        if (!volumeScope) {
            throw new BadRequestException('Workspace file catalog/scope is required for relative file access')
        }
        return this.volumeClient.resolve(volumeScope).path(workspacePath)
    }
}
