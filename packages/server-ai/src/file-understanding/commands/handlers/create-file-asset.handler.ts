import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { createHash } from 'crypto'
import { Repository } from 'typeorm'
import { ConversationFileLink, FileAsset } from '../../entities'
import { CreateFileAssetCommand } from '../create-file-asset.command'

function buildStorageFileMetadata(storageFile?: CreateFileAssetCommand['input']['storageFile']) {
    if (!storageFile) {
        return undefined
    }

    // Chat message APIs return FileAsset rows, not StorageFile relations. Keep a
    // small storage snapshot so preview UIs can render thumbnails without an
    // extra legacy StorageFile lookup.
    return {
        id: storageFile.id,
        file: storageFile.file,
        url: storageFile.url ?? storageFile.fileUrl,
        fileUrl: storageFile.fileUrl ?? storageFile.url,
        thumb: storageFile.thumb,
        thumbUrl: storageFile.thumbUrl ?? storageFile.thumb,
        originalName: storageFile.originalName,
        size: storageFile.size,
        mimetype: storageFile.mimetype,
        storageProvider: storageFile.storageProvider
    }
}

function buildFileAssetMetadata(
    existingMetadata: Record<string, unknown> | undefined,
    inputMetadata: Record<string, unknown> | undefined,
    storageFile?: CreateFileAssetCommand['input']['storageFile']
) {
    const storageFileMetadata = buildStorageFileMetadata(storageFile)

    return {
        ...(existingMetadata ?? {}),
        ...(inputMetadata ?? {}),
        ...(storageFileMetadata ? { storageFile: storageFileMetadata } : {})
    }
}

@CommandHandler(CreateFileAssetCommand)
export class CreateFileAssetHandler implements ICommandHandler<CreateFileAssetCommand> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(ConversationFileLink)
        private readonly conversationFileLinkRepository: Repository<ConversationFileLink>
    ) {}

    async execute(command: CreateFileAssetCommand) {
        const { input } = command
        const storageFileId = input.storageFile?.id ?? input.storageFileId
        if (!storageFileId) {
            throw new BadRequestException('storageFileId is required')
        }

        const existing = await this.fileAssetRepository.findOne({ where: { storageFileId } })
        const uploadedFile = input.uploadedFile
        const sha256 = uploadedFile?.buffer ? createHash('sha256').update(uploadedFile.buffer).digest('hex') : undefined
        const storageFile = input.storageFile
        // StorageFile remains the storage-layer record; FileAsset is deduped by
        // storageFileId so repeated uploads/retries update parser state in place.
        const fileAsset = await this.fileAssetRepository.save(
            this.fileAssetRepository.create({
                ...(existing ?? {}),
                tenantId: RequestContext.currentTenantId() ?? existing?.tenantId,
                organizationId: RequestContext.getOrganizationId() ?? existing?.organizationId,
                userId: RequestContext.currentUserId() ?? existing?.userId,
                storageFileId,
                conversationId: input.conversationId ?? existing?.conversationId,
                threadId: input.threadId ?? existing?.threadId,
                projectId: input.projectId ?? existing?.projectId,
                xpertId: input.xpertId ?? existing?.xpertId,
                originalName: storageFile?.originalName ?? uploadedFile?.originalname ?? existing?.originalName,
                fileName: storageFile?.file ?? existing?.fileName,
                mimeType: storageFile?.mimetype ?? uploadedFile?.mimetype ?? existing?.mimeType,
                size: storageFile?.size ?? uploadedFile?.size ?? existing?.size ?? 0,
                sha256: sha256 ?? existing?.sha256,
                purpose: input.purpose ?? existing?.purpose ?? 'chat_attachment',
                parseMode: input.parseMode ?? existing?.parseMode ?? 'auto',
                status: existing?.status ?? 'uploaded',
                capabilities: existing?.capabilities ?? ['preview'],
                workspacePath: input.workspacePath ?? existing?.workspacePath,
                metadata: buildFileAssetMetadata(existing?.metadata, input.metadata, storageFile)
            })
        )

        if (input.conversationId) {
            const existingLink = await this.conversationFileLinkRepository.findOne({
                where: {
                    conversationId: input.conversationId,
                    fileAssetId: fileAsset.id
                }
            })
            await this.conversationFileLinkRepository.save(
                this.conversationFileLinkRepository.create({
                    ...(existingLink ?? {}),
                    tenantId: RequestContext.currentTenantId() ?? existingLink?.tenantId,
                    organizationId: RequestContext.getOrganizationId() ?? existingLink?.organizationId,
                    conversationId: input.conversationId,
                    fileAssetId: fileAsset.id,
                    storageFileId,
                    threadId: input.threadId ?? existingLink?.threadId,
                    metadata: buildFileAssetMetadata(existingLink?.metadata, input.metadata, storageFile)
                })
            )
        }

        return fileAsset
    }
}
