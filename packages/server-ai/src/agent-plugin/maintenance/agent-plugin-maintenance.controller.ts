import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import type { z } from 'zod/v3'
import { AgentPluginCleanupService } from './agent-plugin-cleanup.service'
import { AgentPluginUpdateService } from './agent-plugin-update.service'
import { cleanupPluginsInput, packageIdSchema, updatePluginInput } from './agent-plugin-maintenance.schema'
const invalid = (error: z.ZodError) => new BadRequestException(error.flatten())

@Controller('agent-plugins')
export class AgentPluginMaintenanceController {
    constructor(
        private readonly updates: AgentPluginUpdateService,
        private readonly cleanup: AgentPluginCleanupService
    ) {}
    @Get('updates') status() {
        return this.updates.status()
    }
    @Post('packages/:id/update')
    @HttpCode(202)
    update(
        @Param('id', new ZodValidationPipe(packageIdSchema, invalid)) id: string,
        @Body(new ZodValidationPipe(updatePluginInput, invalid)) input: z.output<typeof updatePluginInput>
    ) {
        return this.updates.start(id, input)
    }
    @Get('packages/:id/cleanup')
    preview(@Param('id', new ZodValidationPipe(packageIdSchema, invalid)) id: string) {
        return this.cleanup.preview(id)
    }
    @Post('packages/:id/cleanup')
    @HttpCode(200)
    remove(
        @Param('id', new ZodValidationPipe(packageIdSchema, invalid)) id: string,
        @Body(new ZodValidationPipe(cleanupPluginsInput, invalid)) input: z.output<typeof cleanupPluginsInput>
    ) {
        return this.cleanup.cleanup(id, input.packageIds)
    }
}
