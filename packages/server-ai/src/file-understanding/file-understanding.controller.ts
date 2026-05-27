import { ApiKeyOrClientSecretAuthGuard, Public, TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
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

@ApiTags('AI/Files')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller()
export class FileUnderstandingController {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    @Get('files/:fileId')
    getFile(@Param('fileId') fileId: string) {
        return this.queryBus.execute(new GetFileAssetQuery(fileId))
    }

    @Get('files/:fileId/status')
    getFileStatus(@Param('fileId') fileId: string) {
        return this.queryBus.execute(new GetFileParseStatusQuery(fileId))
    }

    @Post('files/:fileId/parse/retry')
    retryParse(@Param('fileId') fileId: string) {
        return this.commandBus.execute(new RetryFileParseCommand(fileId))
    }

    @Post('files/:fileId/search')
    searchFile(@Param('fileId') fileId: string, @Body() body: { query?: string; limit?: number }) {
        return this.queryBus.execute(new SearchFileChunksQuery({ fileId, query: body?.query, limit: body?.limit }))
    }

    @Get('files/:fileId/preview')
    getPreview(@Param('fileId') fileId: string) {
        return this.queryBus.execute(new GetFilePreviewQuery(fileId))
    }

    @Post('files/:fileId/read')
    readFile(@Param('fileId') fileId: string, @Body() body: { chunkId?: string; orderNo?: number }) {
        return this.queryBus.execute(new ReadFileChunkQuery({ fileId, chunkId: body?.chunkId, orderNo: body?.orderNo }))
    }

    @Get('conversations/:conversationId/files')
    listConversationFiles(@Param('conversationId') conversationId: string) {
        return this.queryBus.execute(new ListConversationFilesQuery(conversationId))
    }

    @Delete('files/:fileId')
    deleteFile(@Param('fileId') fileId: string) {
        return this.commandBus.execute(new DeleteFileAssetCommand(fileId))
    }
}
