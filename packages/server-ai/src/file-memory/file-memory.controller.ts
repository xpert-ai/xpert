import { FileInterceptor } from '@nestjs/platform-express'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from '@xpert-ai/server-core'
import {
    Body,
    Controller,
    Delete,
    Query,
    UploadedFile as NestUploadedFile,
    UseInterceptors,
    Get,
    Param,
    Post,
    Put,
    UseGuards
} from '@nestjs/common'
import { UUIDValidationPipe } from '@xpert-ai/server-core'
import { XpertGuard } from '../xpert/guards/xpert.guard'
import type { FileMemoryDreamConfig } from '../plugins/file-memory/types'
import { FileMemoryFacade } from './file-memory.facade'

@UseGuards(XpertGuard)
@Controller('xpert/:id/memory')
@Permissions(AIPermissionsEnum.CHAT_VIEW)
export class FileMemoryController {
    constructor(private readonly facade: FileMemoryFacade) {}

    @Get('files')
    async getMemoryFiles(
        @Param('id', UUIDValidationPipe) id: string,
        @Query('deepth') deepth: number,
        @Query('path') path: string
    ) {
        return await this.facade.getMemoryFiles(id, path, deepth)
    }

    @Get('file')
    async getMemoryFile(@Param('id', UUIDValidationPipe) id: string, @Query('path') path: string) {
        return await this.facade.getMemoryFile(id, path)
    }

    @Put('file')
    async saveMemoryFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Body()
        body: {
            path: string
            content: string
        }
    ) {
        return await this.facade.saveMemoryFile(id, body?.path, body?.content ?? '')
    }

    @Post('file/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadMemoryFile(
        @Param('id', UUIDValidationPipe) id: string,
        @Body('path') path: string,
        @NestUploadedFile() file: Express.Multer.File
    ) {
        return await this.facade.uploadMemoryFile(id, path, file)
    }

    @Delete('file')
    async deleteMemoryFile(@Param('id', UUIDValidationPipe) id: string, @Query('path') path: string) {
        return await this.facade.deleteMemoryFile(id, path)
    }

    @Post('dream')
    async triggerMemoryDream(
        @Param('id', UUIDValidationPipe) id: string,
        @Body()
        body: {
            reason?: 'manual' | 'scheduled' | 'signal_threshold'
        }
    ) {
        return await this.facade.triggerFileMemoryDream(id, body ?? {})
    }

    @Get('dream/config')
    async getMemoryDreamConfig(@Param('id', UUIDValidationPipe) id: string) {
        return await this.facade.getFileMemoryDreamConfig(id)
    }

    @Put('dream/config')
    async saveMemoryDreamConfig(
        @Param('id', UUIDValidationPipe) id: string,
        @Body()
        body: FileMemoryDreamConfig
    ) {
        return await this.facade.saveFileMemoryDreamConfig(id, body ?? {})
    }

    @Get('dream/runs')
    async getMemoryDreamRuns(@Param('id', UUIDValidationPipe) id: string) {
        return await this.facade.listFileMemoryDreamRuns(id)
    }

    @Get('dream/runs/:runId')
    async getMemoryDreamRun(@Param('id', UUIDValidationPipe) id: string, @Param('runId') runId: string) {
        return await this.facade.getFileMemoryDreamRun(id, runId)
    }

    @Post('dream/runs/:runId/cancel')
    async cancelMemoryDreamRun(@Param('id', UUIDValidationPipe) id: string, @Param('runId') runId: string) {
        return await this.facade.cancelFileMemoryDreamRun(id, runId)
    }
}
