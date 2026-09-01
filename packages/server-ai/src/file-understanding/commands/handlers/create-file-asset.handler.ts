import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { createHash } from 'crypto'
import { IsNull, Repository } from 'typeorm'
import { ConversationFileLink, FileAsset } from '../../entities'
import { FileAssetAccessService } from '../../file-asset-access.service'
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
        private readonly conversationFileLinkRepository: Repository<ConversationFileLink>,
        private readonly fileAssetAccessService: FileAssetAccessService
    ) {}

    async execute(command: CreateFileAssetCommand) {
        const { input } = command
        const storageFileId = input.storageFile?.id ?? input.storageFileId
        if (!storageFileId) {
            throw new BadRequestException('storageFileId is required')
        }

        const canonicalStorageFile = await this.fileAssetAccessService.assertStorageFileOwner(storageFileId)
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !userId) {
            throw new ForbiddenException()
        }

        const conversation =
            input.conversationId || input.threadId
                ? await this.fileAssetAccessService.assertConversationAccess(
                      {
                          kind: 'conversation',
                          conversationId: input.conversationId,
                          threadId: input.threadId
                      },
                      'attach'
                  )
                : null
        if (!conversation && (input.projectId || input.xpertId)) {
            await this.fileAssetAccessService.assertUploadScope({
                projectId: input.projectId,
                xpertId: input.xpertId
            })
        }
        if (conversation) {
            await this.fileAssetAccessService.assertConversationInputScope(conversation, input)
            await this.fileAssetAccessService.assertCanCreateConversationAsset(conversation, 'upload')
        }

        const existing = await this.fileAssetRepository.findOne({ where: { storageFileId, tenantId } })
        if (existing) {
            await this.fileAssetAccessService.resolve({
                locator: { fileAssetId: existing.id, storageFileId },
                authority: { kind: 'current-owner' },
                operation: 'write'
            })
            if (conversation) {
                await this.fileAssetAccessService.assertCanLinkToConversation(existing.id, conversation)
            }
        }
        const uploadedFile = input.uploadedFile
        const sha256 = uploadedFile?.buffer ? createHash('sha256').update(uploadedFile.buffer).digest('hex') : undefined
        const storageFile = canonicalStorageFile
        // StorageFile remains the storage-layer record; FileAsset is deduped by
        // storageFileId so repeated uploads/retries update parser state in place.
        const fileAsset = await this.fileAssetRepository.save(
            this.fileAssetRepository.create({
                ...(existing ?? {}),
                tenantId,
                organizationId: organizationId ?? existing?.organizationId,
                userId: existing?.userId ?? userId,
                storageFileId,
                conversationId: existing?.conversationId ?? conversation?.id,
                threadId: existing?.threadId ?? conversation?.threadId,
                projectId: existing?.projectId ?? conversation?.projectId ?? input.projectId,
                xpertId: existing?.xpertId ?? conversation?.xpertId ?? input.xpertId,
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

        if (conversation) {
            const existingLink = await this.conversationFileLinkRepository.findOne({
                where: {
                    tenantId,
                    organizationId: conversation.organizationId ?? IsNull(),
                    conversationId: conversation.id,
                    fileAssetId: fileAsset.id
                }
            })
            await this.conversationFileLinkRepository.save(
                this.conversationFileLinkRepository.create({
                    ...(existingLink ?? {}),
                    tenantId,
                    organizationId: conversation.organizationId ?? existingLink?.organizationId,
                    conversationId: conversation.id,
                    fileAssetId: fileAsset.id,
                    storageFileId,
                    threadId: conversation.threadId ?? existingLink?.threadId,
                    metadata: buildFileAssetMetadata(existingLink?.metadata, input.metadata, storageFile)
                })
            )
        }

        return fileAsset
    }
}
