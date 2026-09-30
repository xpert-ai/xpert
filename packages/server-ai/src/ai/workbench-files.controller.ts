import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Public, TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import type { Response } from 'express'
import { t } from 'i18next'
import { ChatConversationService } from '../chat-conversation/conversation.service'
import { WorkbenchFilesAuthGuard } from './workbench-files-auth.guard'
import { sendWorkbenchFileDownload } from './workbench-file-download'

/** Same workspace services as ClawXpert, with explicit delegated-Assistant authorization. */
@Public()
@UseGuards(WorkbenchFilesAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('conversations/:conversationId')
export class WorkbenchFilesController {
    constructor(private readonly conversations: ChatConversationService) {}
    @Get('files')
    list(
        @Param('conversationId', UUIDValidationPipe) id: string,
        @Query('path') path?: string,
        @Query('deepth') depth?: number
    ) {
        return this.conversations.getWorkspaceFiles(id, path, depth)
    }
    @Get('file')
    read(@Param('conversationId', UUIDValidationPipe) id: string, @Query('path') path: string) {
        return this.conversations.readWorkspaceFile(id, path)
    }
    @Get('file/download')
    async download(
        @Param('conversationId', UUIDValidationPipe) id: string,
        @Query('path') path: string,
        @Res() response: Response
    ) {
        await sendWorkbenchFileDownload(await this.conversations.getWorkspaceFileDownload(id, path), response)
    }
    @Put('file')
    save(@Param('conversationId', UUIDValidationPipe) id: string, @Body() body: { path: string; content: string }) {
        return this.conversations.saveWorkspaceFile(id, body.path, body.content)
    }
    @Post('file/upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
    upload(
        @Param('conversationId', UUIDValidationPipe) id: string,
        @Body('path') path: string,
        @UploadedFile() file: Express.Multer.File
    ) {
        if (!file)
            throw new BadRequestException(
                t('server-ai:Error.WorkspaceFileUploadRequired', { defaultValue: 'Workspace file is required.' })
            )
        return this.conversations.uploadWorkspaceFile(id, path, file)
    }
    @Delete('file')
    delete(@Param('conversationId', UUIDValidationPipe) id: string, @Query('path') path: string) {
        return this.conversations.deleteWorkspaceFile(id, path)
    }
}
