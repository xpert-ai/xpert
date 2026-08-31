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
    GetFileAssetQuery,
    GetFileParseStatusQuery,
    GetFilePreviewQuery,
    ListConversationFilesQuery,
    ReadFileChunkQuery,
    SearchFileChunksQuery
} from './queries'
import { GetChatConversationQuery } from '../chat-conversation/queries/conversation-get.query'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from '../ai/public-xpert-principal'

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
        private readonly queryBus: QueryBus
    ) {}

    @Get('files/:fileId')
    async getFile(@Param('fileId') fileId: string) {
        return this.ensurePublicFileAccess(fileId)
    }

    @Get('files/:fileId/status')
    async getFileStatus(@Param('fileId') fileId: string) {
        await this.ensurePublicFileAccess(fileId)
        return this.queryBus.execute(new GetFileParseStatusQuery(fileId))
    }

    @Post('files/:fileId/parse/retry')
    async retryParse(@Param('fileId') fileId: string) {
        await this.ensurePublicFileAccess(fileId)
        return this.commandBus.execute(new RetryFileParseCommand(fileId))
    }

    @Post('files/:fileId/search')
    async searchFile(@Param('fileId') fileId: string, @Body() body: { query?: string; limit?: number }) {
        await this.ensurePublicFileAccess(fileId)
        return this.queryBus.execute(new SearchFileChunksQuery({ fileId, query: body?.query, limit: body?.limit }))
    }

    @Get('files/:fileId/preview')
    async getPreview(@Param('fileId') fileId: string) {
        await this.ensurePublicFileAccess(fileId)
        return this.queryBus.execute(new GetFilePreviewQuery(fileId))
    }

    @Post('files/:fileId/read')
    async readFile(@Param('fileId') fileId: string, @Body() body: { chunkId?: string; orderNo?: number }) {
        await this.ensurePublicFileAccess(fileId)
        return this.queryBus.execute(new ReadFileChunkQuery({ fileId, chunkId: body?.chunkId, orderNo: body?.orderNo }))
    }

    @Get('conversations/:conversationId/files')
    async listConversationFiles(@Param('conversationId') conversationId: string) {
        if (getPublicXpertSessionConversationScope()) {
            const conversation = await this.queryBus.execute(new GetChatConversationQuery({ id: conversationId }))
            await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        }
        return this.queryBus.execute(new ListConversationFilesQuery(conversationId))
    }

    @Delete('files/:fileId')
    async deleteFile(@Param('fileId') fileId: string) {
        await this.ensurePublicFileAccess(fileId)
        return this.commandBus.execute(new DeleteFileAssetCommand(fileId))
    }

    private async ensurePublicFileAccess(fileId: string) {
        const fileAsset = await this.queryBus.execute(new GetFileAssetQuery(fileId))
        const scope = getPublicXpertSessionConversationScope()
        if (scope && (!fileAsset || fileAsset.userId !== scope.createdById || fileAsset.xpertId !== scope.xpertId)) {
            throw new ForbiddenException()
        }
        return fileAsset
    }
}
