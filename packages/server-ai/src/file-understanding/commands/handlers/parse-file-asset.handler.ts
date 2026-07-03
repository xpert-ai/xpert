import { IStorageFile } from '@xpert-ai/contracts'
import { FileStorage, GetStorageFileQuery } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Repository } from 'typeorm'
import {
    readPageImageParseRunId,
    readPageImageStorageKey,
    readWorkspaceProvider
} from '../../domain/page-image-artifact'
import { ParsedFileArtifact } from '../../domain/types'
import { FileArtifact, FileAsset, FileChunk } from '../../entities'
import { FileWorkspaceProjectionService } from '../../file-workspace-projection.service'
import { FileParserRegistry } from '../../parsers'
import { normalizeRelativePath } from '../../../shared/file-upload-targets/utils'
import { IndexFileChunksCommand } from '../index-file-chunks.command'
import { ParseFileAssetCommand } from '../parse-file-asset.command'

type StalePageImage = {
    storageKey: string
    parseRunId?: string
}

@CommandHandler(ParseFileAssetCommand)
export class ParseFileAssetHandler implements ICommandHandler<ParseFileAssetCommand> {
    readonly #logger = new Logger(ParseFileAssetHandler.name)

    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly parserRegistry: FileParserRegistry,
        private readonly workspaceProjectionService: FileWorkspaceProjectionService
    ) {}

    async execute(command: ParseFileAssetCommand) {
        const asset = await this.fileAssetRepository.findOneByOrFail({ id: command.fileAssetId })
        if (asset.parseMode === 'none') {
            asset.status = 'ready'
            asset.parsedAt = new Date()
            return this.fileAssetRepository.save(asset)
        }

        asset.status = 'parsing'
        asset.error = null
        await this.fileAssetRepository.save(asset)

        try {
            const storageFile = await this.resolveStorageFile(asset.storageFileId)
            const workspaceSource = this.resolveWorkspaceSource(asset)
            if (!storageFile && !workspaceSource?.absolutePath) {
                throw new Error(`File asset "${asset.id}" does not have a readable storage or workspace source`)
            }
            const filePath = storageFile ? this.resolveStorageFilePath(storageFile) : workspaceSource!.absolutePath
            const parseRunId = randomUUID()
            const stalePageImages = await this.listStalePageImages(asset.id)
            const source = {
                filePath,
                originalName: storageFile?.originalName ?? asset.originalName ?? workspaceSource?.originalName,
                mimeType: storageFile?.mimetype ?? asset.mimeType ?? workspaceSource?.mimeType,
                size: storageFile?.size ?? asset.size ?? workspaceSource?.size,
                derivedOutput: {
                    storageProvider: storageFile?.storageProvider,
                    directory: this.resolveDerivedStorageDirectory(asset, parseRunId),
                    parseRunId
                }
            }
            const parser = this.parserRegistry.getParser(source)
            const parsed = await parser.parse(source)
            await this.replaceArtifacts(asset, parsed.artifacts)
            const chunks = await this.commandBus.execute<IndexFileChunksCommand, FileChunk[]>(
                new IndexFileChunksCommand(asset.id)
            )

            asset.status = parsed.status ?? 'ready'
            asset.summary = parsed.summary
            asset.capabilities = Array.from(
                new Set([...(asset.capabilities ?? []), 'preview', 'read', ...parsed.capabilities])
            )
            asset.metadata = {
                ...(asset.metadata ?? {}),
                ...(parsed.metadata ?? {}),
                parser: parser.name,
                chunkCount: chunks.length
            }
            asset.parsedAt = new Date()
            asset.failedAt = null
            asset.error = null
            const savedAsset = await this.fileAssetRepository.save(asset)
            const projectedAsset = await this.projectParsedPageImages(savedAsset)
            await this.deleteStalePageImages(storageFile?.storageProvider, savedAsset, stalePageImages)
            return projectedAsset ?? savedAsset
        } catch (error) {
            this.#logger.warn(
                `Failed to parse file asset ${command.fileAssetId}: ${error instanceof Error ? error.message : error}`
            )
            asset.status = 'failed'
            asset.error = error instanceof Error ? error.message : String(error)
            asset.failedAt = new Date()
            return this.fileAssetRepository.save(asset)
        }
    }

    private async resolveStorageFile(storageFileId?: string) {
        if (!storageFileId) {
            return null
        }
        const files = await this.queryBus.execute<GetStorageFileQuery, IStorageFile[]>(
            new GetStorageFileQuery([storageFileId])
        )
        return files[0] ?? null
    }

    private resolveStorageFilePath(storageFile: IStorageFile) {
        const provider = new FileStorage().getProvider(storageFile.storageProvider)
        return provider.path(storageFile.file)
    }

    private resolveWorkspaceSource(asset: FileAsset) {
        const workspace = asset.metadata?.workspace
        if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
            return null
        }
        const record = workspace as Record<string, unknown>
        const absolutePath = readString(record.absolutePath)
        if (!absolutePath) {
            return null
        }
        return {
            absolutePath,
            originalName: readString(record.originalName) ?? asset.originalName,
            mimeType: readString(record.mimeType) ?? asset.mimeType,
            size: readNumber(record.size) ?? asset.size
        }
    }

    private resolveDerivedStorageDirectory(asset: FileAsset, parseRunId: string) {
        return normalizeRelativePath('contexts', asset.tenantId, 'file-understanding', asset.id, parseRunId)
    }

    private async listStalePageImages(fileAssetId: string): Promise<StalePageImage[]> {
        const artifacts = await this.fileArtifactRepository.find({
            where: {
                fileAssetId,
                kind: 'page_image'
            },
            select: {
                metadata: true
            }
        })
        const stalePageImages: StalePageImage[] = []
        for (const artifact of artifacts) {
            const storageKey = readPageImageStorageKey(artifact.metadata)
            if (!storageKey) {
                continue
            }
            stalePageImages.push({
                storageKey,
                parseRunId: readPageImageParseRunId(artifact.metadata)
            })
        }
        return stalePageImages
    }

    private async projectParsedPageImages(asset: FileAsset) {
        if (!asset.conversationId || (!asset.projectId && !asset.xpertId)) {
            return null
        }
        return await this.workspaceProjectionService
            .projectFileAsset({
                fileAssetId: asset.id,
                storageFileId: asset.storageFileId,
                conversationId: asset.conversationId,
                threadId: asset.threadId,
                projectId: asset.projectId,
                xpertId: asset.xpertId,
                sandboxProvider: readWorkspaceProvider(asset.metadata)
            })
            .catch((error) => {
                this.#logger.warn(
                    `Failed to project parsed page images for ${asset.id}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
                return null
            })
    }

    private async deleteStalePageImages(
        storageProvider: string | undefined,
        asset: FileAsset,
        stalePageImages: StalePageImage[]
    ) {
        if (!stalePageImages.length) {
            return
        }
        try {
            const provider = new FileStorage().getProvider(storageProvider)
            await Promise.all(
                stalePageImages.map((image) =>
                    provider.deleteFile(image.storageKey).catch((error) => {
                        this.#logger.warn(
                            `Failed to delete stale PDF page image "${image.storageKey}": ${
                                error instanceof Error ? error.message : String(error)
                            }`
                        )
                    })
                )
            )
            await this.deleteStalePageImageRunDirectories(provider, asset, stalePageImages)
        } catch (error) {
            this.#logger.warn(
                `Failed to clean stale PDF page images: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async deleteStalePageImageRunDirectories(
        provider: ReturnType<FileStorage['getProvider']>,
        asset: FileAsset,
        stalePageImages: StalePageImage[]
    ) {
        const runDirectories = new Set<string>()
        for (const image of stalePageImages) {
            if (image.parseRunId) {
                runDirectories.add(
                    normalizeRelativePath('contexts', asset.tenantId, 'file-understanding', asset.id, image.parseRunId)
                )
                continue
            }
            const pagesDirectory = path.posix.dirname(image.storageKey)
            runDirectories.add(path.posix.dirname(pagesDirectory))
        }

        await Promise.all(
            Array.from(runDirectories).map(async (runDirectory) => {
                const fullPath = provider.path(runDirectory)
                if (!fullPath || !path.isAbsolute(fullPath)) {
                    return
                }
                await fsPromises.rm(fullPath, { recursive: true, force: true }).catch(() => undefined)
            })
        )
    }

    private async replaceArtifacts(asset: FileAsset, artifacts: ParsedFileArtifact[]) {
        await this.fileArtifactRepository.delete({ fileAssetId: asset.id })
        return this.fileArtifactRepository.save(
            artifacts.map((artifact, index) =>
                this.fileArtifactRepository.create({
                    tenantId: asset.tenantId,
                    organizationId: asset.organizationId,
                    fileAssetId: asset.id,
                    kind: artifact.kind,
                    orderNo: index,
                    mimeType: artifact.mimeType,
                    content: artifact.content,
                    anchor: artifact.anchor,
                    metadata: artifact.metadata
                })
            )
        )
    }
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
