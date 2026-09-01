import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    UploadFileCommand,
    getFileAssetDestination,
    getStorageFileFromAsset,
    StorageFileService,
    TransformInterceptor
} from '@xpert-ai/server-core'
import { IFileAssetDestination, IStorageFile, SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Logger,
    Param,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'
import {
    AgentFile,
    CreateFileAssetCommand,
    DeleteFileAssetCommand,
    EnqueueFileParseCommand,
    FileAsset,
    FileAssetPurpose,
    FileParseMode,
    GetFileAssetByStorageFileQuery
} from '../file-understanding'
import type { ChatConversation } from '../chat-conversation/conversation.entity'
import { FileAssetAccessService } from '../file-understanding/file-asset-access.service'
import { resolveExternalStorageUploadTarget } from './external-upload-target'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from './public-xpert-principal'

/**
 * Context APIs for AI (files, documents, etc.)
 */
@ApiTags('AI/Contexts')
@ApiBearerAuth()
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('contexts')
export class ContextsController {
    readonly #logger = new Logger(ContextsController.name)

    constructor(
        private readonly queryBus: QueryBus,
        private readonly commandBus: CommandBus,
        private readonly storageFileService: StorageFileService,
        private readonly fileAssetAccessService: FileAssetAccessService
    ) {}

    @Post('file')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Upload a context file. The optional target field must be a JSON-encoded IUploadFileTarget.',
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary'
                },
                target: {
                    type: 'string',
                    description:
                        'Optional JSON-encoded target. Defaults to {"kind":"storage","directory":"contexts","prefix":"files"}.'
                }
            }
        }
    })
    async create(
        @UploadedFile() file: Express.Multer.File,
        @Body('target') targetValue?: string,
        @Body('purpose') purposeValue?: FileAssetPurpose,
        @Body('parseMode') parseModeValue?: FileParseMode,
        @Body('conversationId') conversationId?: string,
        @Body('threadId') threadId?: string,
        @Body('projectId') projectId?: string,
        @Body('xpertId') xpertId?: string,
        @Body('workspacePath') workspacePath?: string
    ): Promise<AgentFile | IFileAssetDestination> {
        const target = resolveExternalStorageUploadTarget(targetValue, {
            kind: 'storage',
            directory: 'contexts',
            prefix: 'files'
        })
        workspacePath = undefined
        const conversation = await this.resolveConversationReferences(conversationId, threadId)
        if (conversation) {
            conversationId = conversation.id
            threadId = conversation.threadId
            projectId = conversation.projectId
            xpertId = conversation.xpertId
        }
        const publicScope = getPublicXpertSessionConversationScope()
        if (publicScope) {
            if (target.kind !== 'storage' || projectId) {
                throw new ForbiddenException()
            }
            if (!conversation && xpertId?.trim() && xpertId.trim() !== publicScope.xpertId) {
                throw new ForbiddenException()
            }
            xpertId = conversation?.xpertId ?? publicScope.xpertId
        } else if (!conversation) {
            await this.fileAssetAccessService.assertUploadScope({ projectId, xpertId })
        }
        if (conversation) {
            await this.fileAssetAccessService.assertCanCreateConversationAsset(conversation, 'upload')
        }
        const asset = await this.commandBus.execute(
            new UploadFileCommand({
                source: {
                    kind: 'multipart',
                    file
                },
                targets: [target]
            })
        )

        const destination = getFileAssetDestination(asset, target.kind)
        if (!destination || destination.status !== 'success') {
            throw new BadRequestException(
                destination?.error || `Failed to upload context file to target '${target.kind}'`
            )
        }

        if (target.kind === 'storage') {
            const storageFile = getStorageFileFromAsset(asset)
            if (!storageFile) {
                throw new BadRequestException('Failed to upload context file')
            }
            // StorageFile is still created for object storage compatibility; the
            // returned AgentFile points clients and agents at the FileAsset layer.
            const parseMode = this.resolveParseMode(parseModeValue)
            const fileAsset = await this.commandBus.execute<CreateFileAssetCommand, FileAsset>(
                new CreateFileAssetCommand({
                    storageFile,
                    uploadedFile: file,
                    purpose: purposeValue ?? 'chat_attachment',
                    parseMode,
                    conversationId,
                    threadId,
                    projectId,
                    xpertId,
                    workspacePath
                })
            )
            const parsedAsset =
                parseMode === 'none'
                    ? fileAsset
                    : await this.commandBus.execute<EnqueueFileParseCommand, FileAsset>(
                          new EnqueueFileParseCommand(fileAsset.id, {
                              runInline: this.shouldRunParseInline(file, parseMode)
                          })
                      )
            return this.withFileUnderstanding(storageFile, parsedAsset)
        }

        return destination
    }

    @Delete('file/:id')
    async delete(@Param('id') id: string) {
        const fileAsset = await this.queryBus.execute<GetFileAssetByStorageFileQuery, FileAsset | null>(
            new GetFileAssetByStorageFileQuery(id)
        )
        let authorizedStorageFile: IStorageFile
        if (fileAsset?.id) {
            const { asset: authorizedAsset, storageFile } = await this.fileAssetAccessService.resolve({
                locator: { fileAssetId: fileAsset.id, storageFileId: id },
                authority: { kind: 'current-owner' },
                operation: 'delete'
            })
            if (!storageFile) {
                throw new ForbiddenException()
            }
            authorizedStorageFile = storageFile
            await this.assertPublicFileAccess(authorizedAsset)
            await this.commandBus.execute(new DeleteFileAssetCommand(authorizedAsset.id))
        } else {
            await this.assertPublicFileAccess(null)
            authorizedStorageFile = await this.fileAssetAccessService.assertStorageFileOwner(id)
        }
        return await this.storageFileService.deleteAuthorizedStorageFile(authorizedStorageFile)
    }

    private async resolveConversationReferences(conversationId?: string, threadId?: string) {
        let conversationById: ChatConversation | undefined
        let conversationByThread: ChatConversation | undefined
        if (conversationId) {
            conversationById = await this.fileAssetAccessService.assertConversationAccess(
                { kind: 'conversation', conversationId },
                'attach'
            )
        }
        if (threadId) {
            conversationByThread = await this.fileAssetAccessService.assertConversationAccess(
                { kind: 'conversation', threadId },
                'attach'
            )
        }
        if (conversationById && conversationByThread && conversationById.id !== conversationByThread.id) {
            throw new BadRequestException('Conversation and thread references do not match')
        }
        const conversation = conversationById ?? conversationByThread
        if (conversation && getPublicXpertSessionConversationScope()) {
            await (
                assertPublicXpertSessionConversationAccess as unknown as (
                    conversation: ChatConversation,
                    queryBus: QueryBus
                ) => Promise<void> | void
            )(conversation, this.queryBus)
        }
        return conversation
    }

    private async assertPublicFileAccess(fileAsset: FileAsset | null) {
        const scope = getPublicXpertSessionConversationScope()
        if (!scope) {
            return
        }
        if (!fileAsset || fileAsset.userId !== scope.createdById) {
            throw new ForbiddenException()
        }
        await (
            assertPublicXpertSessionConversationAccess as unknown as (
                conversation: Pick<ChatConversation, 'createdById' | 'xpertId'>,
                queryBus: QueryBus
            ) => Promise<void> | void
        )({ createdById: fileAsset.userId, xpertId: fileAsset.xpertId }, this.queryBus)
    }

    private resolveParseMode(value?: FileParseMode): FileParseMode {
        if (!value) {
            return 'auto'
        }
        if (!['auto', 'fast', 'deep', 'none'].includes(value)) {
            throw new BadRequestException('Invalid parseMode payload')
        }
        return value
    }

    private shouldRunParseInline(file: Express.Multer.File, parseMode: FileParseMode) {
        if (parseMode === 'fast') {
            return true
        }
        if (parseMode === 'deep') {
            return false
        }
        return (file?.size ?? 0) <= 2_000_000
    }

    private withFileUnderstanding(storageFile: IStorageFile, fileAsset: FileAsset): AgentFile {
        return {
            id: fileAsset.id,
            fileId: fileAsset.id,
            storageFileId: storageFile.id,
            objectKey: storageFile.file,
            url: storageFile.url ?? storageFile.fileUrl,
            fileUrl: storageFile.fileUrl,
            thumbUrl: storageFile.thumbUrl,
            originalName: storageFile.originalName,
            size: storageFile.size,
            mimeType: storageFile.mimetype,
            status: fileAsset.status,
            parseStatus: fileAsset.status,
            purpose: fileAsset.purpose,
            parseMode: fileAsset.parseMode,
            capabilities: fileAsset.capabilities ?? [],
            summary: fileAsset.summary,
            workspacePath: fileAsset.workspacePath
        }
    }
}
