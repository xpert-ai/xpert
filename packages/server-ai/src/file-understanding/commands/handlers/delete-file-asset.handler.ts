import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FileStorage, StorageFileService } from '@xpert-ai/server-core'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Repository } from 'typeorm'
import { readPageImageStorageKey } from '../../domain/page-image-artifact'
import {
    ConversationFileLink,
    FileArtifact,
    FileAsset,
    FileChunk,
    FileCitationAnchor,
    FileEmbedding
} from '../../entities'
import { DeleteFileAssetCommand } from '../delete-file-asset.command'
import { normalizeRelativePath } from '../../../shared/file-upload-targets/utils'

@CommandHandler(DeleteFileAssetCommand)
export class DeleteFileAssetHandler implements ICommandHandler<DeleteFileAssetCommand> {
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
        @InjectRepository(ConversationFileLink)
        private readonly conversationFileLinkRepository: Repository<ConversationFileLink>,
        private readonly storageFileService: StorageFileService
    ) {}

    async execute(command: DeleteFileAssetCommand) {
        const asset = await this.fileAssetRepository.findOne({ where: { id: command.fileAssetId } })
        const pageImageStorageKeys = await this.listPageImageStorageKeys(command.fileAssetId)
        const storageProvider = await this.resolveStorageProvider(asset)

        await this.fileCitationAnchorRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileEmbeddingRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileChunkRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileArtifactRepository.delete({ fileAssetId: command.fileAssetId })
        await this.conversationFileLinkRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileAssetRepository.delete({ id: command.fileAssetId })

        await this.deletePageImageStorageKeys(storageProvider, pageImageStorageKeys)
        await this.deleteDerivedRootIfLocal(storageProvider, asset)
    }

    private async listPageImageStorageKeys(fileAssetId: string) {
        const artifacts = await this.fileArtifactRepository.find({
            where: {
                fileAssetId,
                kind: 'page_image'
            },
            select: {
                metadata: true
            }
        })
        return artifacts
            .map((artifact) => readPageImageStorageKey(artifact.metadata))
            .filter((value): value is string => Boolean(value))
    }

    private async resolveStorageProvider(asset: FileAsset | null) {
        if (!asset?.storageFileId) {
            return undefined
        }
        return await this.storageFileService
            .findOne(asset.storageFileId)
            .then((storageFile) => storageFile?.storageProvider)
            .catch(() => undefined)
    }

    private async deletePageImageStorageKeys(storageProvider: string | undefined, storageKeys: string[]) {
        if (!storageKeys.length) {
            return
        }
        const provider = new FileStorage().getProvider(storageProvider)
        await Promise.all(storageKeys.map((storageKey) => provider.deleteFile(storageKey).catch(() => undefined)))
    }

    private async deleteDerivedRootIfLocal(storageProvider: string | undefined, asset: FileAsset | null) {
        if (!asset?.tenantId) {
            return
        }
        const provider = new FileStorage().getProvider(storageProvider)
        const derivedRoot = normalizeRelativePath('contexts', asset.tenantId, 'file-understanding', asset.id)
        const fullPath = provider.path(derivedRoot)
        if (!fullPath || !path.isAbsolute(fullPath)) {
            return
        }
        await fsPromises.rm(fullPath, { recursive: true, force: true }).catch(() => undefined)
    }
}
