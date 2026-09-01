import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor
} from '@xpert-ai/server-core'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    Body,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Param,
    Post,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { DeleteFileAssetCommand, RetryFileParseCommand } from './commands'
import {
    GetFileParseStatusQuery,
    GetFilePreviewQuery,
    ListConversationFilesQuery,
    ReadFileChunkQuery,
    SearchFileChunksQuery
} from './queries'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from '../ai/public-xpert-principal'
import { FileAssetAccessService, type FileAssetOperation } from './file-asset-access.service'

@ApiTags('AI/Files')
@ApiBearerAuth()
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller()
export class FileUnderstandingController {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly fileAssetAccessService: FileAssetAccessService
    ) {}

    @Get('files/:fileId')
    async getFile(@Param('fileId') fileId: string) {
        return this.authorizeFile(fileId, 'read')
    }

    @Get('files/:fileId/status')
    async getFileStatus(@Param('fileId') fileId: string) {
        const fileAsset = await this.authorizeFile(fileId, 'read')
        return this.queryBus.execute(new GetFileParseStatusQuery(fileAsset.id))
    }

    @Post('files/:fileId/parse/retry')
    async retryParse(@Param('fileId') fileId: string) {
        const fileAsset = await this.authorizeFile(fileId, 'parse')
        return this.commandBus.execute(new RetryFileParseCommand(fileAsset.id))
    }

    @Post('files/:fileId/search')
    async searchFile(@Param('fileId') fileId: string, @Body() body: { query?: string; limit?: number }) {
        const fileAsset = await this.authorizeFile(fileId, 'read')
        return this.queryBus.execute(
            new SearchFileChunksQuery({ fileId: fileAsset.id, query: body?.query, limit: body?.limit })
        )
    }

    @Get('files/:fileId/preview')
    async getPreview(@Param('fileId') fileId: string) {
        const fileAsset = await this.authorizeFile(fileId, 'read')
        return this.queryBus.execute(new GetFilePreviewQuery(fileAsset.id))
    }

    @Post('files/:fileId/read')
    async readFile(@Param('fileId') fileId: string, @Body() body: { chunkId?: string; orderNo?: number }) {
        const fileAsset = await this.authorizeFile(fileId, 'read')
        return this.queryBus.execute(
            new ReadFileChunkQuery({ fileId: fileAsset.id, chunkId: body?.chunkId, orderNo: body?.orderNo })
        )
    }

    @Get('conversations/:conversationId/files')
    async listConversationFiles(@Param('conversationId') conversationId: string) {
        const conversation = await this.fileAssetAccessService.assertConversationAccess(
            { kind: 'conversation', conversationId },
            'read'
        )
        if (getPublicXpertSessionConversationScope()) {
            await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        }
        return this.queryBus.execute(new ListConversationFilesQuery(conversation.id))
    }

    @Delete('files/:fileId')
    async deleteFile(@Param('fileId') fileId: string) {
        const fileAsset = await this.authorizeFile(fileId, 'delete')
        return this.commandBus.execute(new DeleteFileAssetCommand(fileAsset.id))
    }

    private async authorizeFile(fileId: string, operation: FileAssetOperation) {
        const { asset: fileAsset } = await this.fileAssetAccessService.resolve({
            locator: { fileAssetId: fileId },
            authority: { kind: 'current-owner' },
            operation
        })
        const scope = getPublicXpertSessionConversationScope()
        if (scope) {
            if (!fileAsset || fileAsset.userId !== scope.createdById) {
                throw new ForbiddenException()
            }
            await (
                assertPublicXpertSessionConversationAccess as unknown as (
                    conversation: { createdById?: string; xpertId?: string },
                    queryBus: QueryBus
                ) => Promise<void> | void
            )({ createdById: fileAsset.userId, xpertId: fileAsset.xpertId }, this.queryBus)
        }
        return fileAsset
    }
}
