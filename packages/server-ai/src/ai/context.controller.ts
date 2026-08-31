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
import { IFileAssetDestination, IStorageFile, IUploadFileTarget, SecretTokenBindingType } from '@xpert-ai/contracts'
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
import { GetChatConversationQuery } from '../chat-conversation'
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
        private readonly storageFileService: StorageFileService
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
        const target = this.resolveUploadTarget(targetValue)
        const publicScope = getPublicXpertSessionConversationScope()
        if (publicScope) {
            if (target.kind !== 'storage' || projectId) {
                throw new ForbiddenException()
            }
            if (xpertId?.trim() && xpertId.trim() !== publicScope.xpertId) {
                throw new ForbiddenException()
            }
            await this.ensurePublicConversationReference(conversationId, threadId)
            xpertId = publicScope.xpertId
            // Restricted clients cannot choose a logical Agent Workspace path.
            // The trusted projection layer derives it later from the FileAsset id.
            workspacePath = undefined
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
        this.assertPublicFileAccess(fileAsset)
        if (fileAsset?.id) {
            await this.commandBus.execute(new DeleteFileAssetCommand(fileAsset.id))
        }
        return await this.storageFileService.deleteStorageFile(id)
    }

    private async ensurePublicConversationReference(conversationId?: string, threadId?: string) {
        if (!getPublicXpertSessionConversationScope()) {
            return
        }
        if (conversationId) {
            const conversation = await this.queryBus.execute(new GetChatConversationQuery({ id: conversationId }))
            await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        }
        if (threadId) {
            const conversation = await this.queryBus.execute(new GetChatConversationQuery({ threadId }))
            await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        }
    }

    private assertPublicFileAccess(fileAsset: FileAsset | null) {
        const scope = getPublicXpertSessionConversationScope()
        if (!scope) {
            return
        }
        if (!fileAsset || fileAsset.userId !== scope.createdById || fileAsset.xpertId !== scope.xpertId) {
            throw new ForbiddenException()
        }
    }

    private resolveUploadTarget(targetValue?: string): IUploadFileTarget {
        const defaultTarget: IUploadFileTarget = {
            kind: 'storage',
            directory: 'contexts',
            prefix: 'files'
        }

        if (!targetValue) {
            return defaultTarget
        }

        const target = this.parseJson<IUploadFileTarget>(targetValue, 'target')
        if (!target || Array.isArray(target) || !target.kind) {
            throw new BadRequestException('Invalid target payload')
        }

        if (target.kind === 'storage') {
            return {
                ...defaultTarget,
                ...target
            }
        }

        return target
    }

    private parseJson<T>(value: string, field: string): T {
        try {
            return JSON.parse(value) as T
        } catch {
            throw new BadRequestException(`Invalid ${field} JSON`)
        }
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
