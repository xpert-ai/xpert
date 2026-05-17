import { TPromptWorkflow, TXpertCommandProfile } from '@xpert-ai/contracts'
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PaginationParams, ParseJsonPipe, RequestContext, TransformInterceptor } from '@xpert-ai/server-core'
import { WorkspaceGuard } from '../xpert-workspace'
import { PromptWorkflow } from './prompt-workflow.entity'
import { PromptWorkflowService } from './prompt-workflow.service'

@ApiTags('Prompt Workflow')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('prompt-workflow')
export class PromptWorkflowController {
    constructor(private readonly service: PromptWorkflowService) {}

    @UseGuards(WorkspaceGuard)
    @Get('by-workspace/:workspaceId')
    async getAllByWorkspace(
        @Param('workspaceId') workspaceId: string,
        @Query('data', ParseJsonPipe) data: PaginationParams<PromptWorkflow>,
        @Query('published') published?: boolean
    ) {
        return this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
    }

    @UseGuards(WorkspaceGuard)
    @Post('workspace/:workspaceId')
    async createInWorkspace(@Param('workspaceId') workspaceId: string, @Body() body: Partial<TPromptWorkflow>) {
        return this.service.createInWorkspace(workspaceId, body)
    }

    @UseGuards(WorkspaceGuard)
    @Put('workspace/:workspaceId/:id')
    async updateInWorkspace(
        @Param('workspaceId') workspaceId: string,
        @Param('id') id: string,
        @Body() body: Partial<TPromptWorkflow>
    ) {
        return this.service.updateInWorkspace(workspaceId, id, body)
    }

    @UseGuards(WorkspaceGuard)
    @Post('workspace/:workspaceId/:id/archive')
    async archiveInWorkspace(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
        return this.service.archiveInWorkspace(workspaceId, id)
    }

    @UseGuards(WorkspaceGuard)
    @Post('workspace/:workspaceId/:id/duplicate')
    async duplicateInWorkspace(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
        return this.service.duplicateInWorkspace(workspaceId, id)
    }

    @UseGuards(WorkspaceGuard)
    @Get('workspace/:workspaceId/:id/usage')
    async getUsage(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
        return this.service.getUsage(workspaceId, id)
    }

    @UseGuards(WorkspaceGuard)
    @Post('workspace/:workspaceId/validate-profile')
    async validateCommandProfile(@Param('workspaceId') workspaceId: string, @Body() body: TXpertCommandProfile) {
        return this.service.validateCommandProfile(workspaceId, body)
    }
}
