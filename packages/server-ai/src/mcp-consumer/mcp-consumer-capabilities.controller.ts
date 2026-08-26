import { Controller, Get, Param, UseGuards, UseInterceptors } from '@nestjs/common'
import { TransformInterceptor } from '@xpert-ai/server-core'
import { WorkspaceGuard } from '../xpert-workspace/guards/workspace.guard'
import { McpConsumerCapabilitiesService } from './mcp-consumer-capabilities.service'

@UseInterceptors(TransformInterceptor)
@Controller('mcp-consumer')
export class McpConsumerCapabilitiesController {
    constructor(private readonly service: McpConsumerCapabilitiesService) {}

    @UseGuards(WorkspaceGuard)
    @Get(':workspaceId/:toolsetId/capabilities')
    discover(@Param('workspaceId') workspaceId: string, @Param('toolsetId') toolsetId: string) {
        return this.service.discover(workspaceId, toolsetId)
    }
}
