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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ApiKeyOrClientSecretAuthGuard, Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import type { Response } from 'express'
import { t } from 'i18next'
import { XpertWorkspaceFilesService } from '../xpert/xpert-workspace-files.service'
import { streamWorkspaceDownload } from '../xpert/workspace-file-download'
import { AssistantFileAccess, AssistantFileAccessGuard } from './assistant-file-access.guard'
import { WORKSPACE_FILE_UPLOAD_MAX_BYTES } from '../shared/workspace-file-limits'
import {
    workspaceFileQuerySchema,
    workspaceFilesQuerySchema,
    workspaceFileWriteSchema,
    workspaceFileUploadSchema,
    WorkspaceFileQuery,
    WorkspaceFilesQuery,
    WorkspaceFileWrite,
    WorkspaceFileUpload
} from './assistant-workspace-files.schema'

const uploadOptions = { limits: { fileSize: WORKSPACE_FILE_UPLOAD_MAX_BYTES } }

@ApiTags('AssistantWorkspaceFiles')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard, AssistantFileAccessGuard)
@AssistantFileAccess('workspace')
@Controller('assistants/:assistantId/workspace')
export class AssistantWorkspaceFilesController {
    constructor(private readonly workspaceFilesService: XpertWorkspaceFilesService) {}

    @Get('files')
    listWorkspaceFiles(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(workspaceFilesQuerySchema, invalidWorkspaceFileRequest)) query: WorkspaceFilesQuery
    ) {
        return this.workspaceFilesService.list(id, query.path, query.deepth)
    }

    @Get('file')
    readWorkspaceFile(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(workspaceFileQuerySchema, invalidWorkspaceFileRequest)) query: WorkspaceFileQuery
    ) {
        return this.workspaceFilesService.read(id, query.path)
    }

    @Get('file/download')
    async downloadWorkspaceFile(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(workspaceFileQuerySchema, invalidWorkspaceFileRequest)) query: WorkspaceFileQuery,
        @Res() res: Response
    ) {
        return streamWorkspaceDownload(await this.workspaceFilesService.download(id, query.path), res)
    }

    @Put('file')
    saveWorkspaceFile(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(workspaceFileWriteSchema, invalidWorkspaceFileRequest)) body: WorkspaceFileWrite
    ) {
        return this.workspaceFilesService.save(id, body.path, body.content)
    }

    @Delete('file')
    deleteWorkspaceFile(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Query(new ZodValidationPipe(workspaceFileQuerySchema, invalidWorkspaceFileRequest)) query: WorkspaceFileQuery
    ) {
        return this.workspaceFilesService.delete(id, query.path)
    }

    @Post('file/upload')
    @UseInterceptors(FileInterceptor('file', uploadOptions))
    uploadWorkspaceFile(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(workspaceFileUploadSchema, invalidWorkspaceFileRequest)) body: WorkspaceFileUpload,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.workspaceFilesService.uploadToFolder(id, body.path, requireFile(file))
    }

    @Post('file/save-binary')
    @UseInterceptors(FileInterceptor('file', uploadOptions))
    saveWorkspaceBinaryFile(
        @Param('assistantId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(workspaceFileQuerySchema, invalidWorkspaceFileRequest)) body: WorkspaceFileQuery,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.workspaceFilesService.saveBinary(id, body.path, requireFile(file).buffer)
    }
}

function requireFile(file?: Express.Multer.File) {
    if (!file)
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFileUploadRequired', { defaultValue: 'Workspace file is required.' })
        )
    return file
}

function invalidWorkspaceFileRequest() {
    return new BadRequestException(
        t('server-ai:Error.WorkspaceFileInvalidRequest', { defaultValue: 'Invalid workspace file request.' })
    )
}
