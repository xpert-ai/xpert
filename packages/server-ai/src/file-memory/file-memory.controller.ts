import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { UUIDValidationPipe } from '@xpert-ai/server-core'
import { XpertGuard } from '../xpert/guards/xpert.guard'
import { FileMemoryFacade } from './file-memory.facade'

@UseGuards(XpertGuard)
@Controller('xpert/:id/memory')
export class FileMemoryController {
    constructor(private readonly facade: FileMemoryFacade) {}

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
        body: {
            dreamerXpertId?: string
            dreamerAgentKey?: string
        }
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
