import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { McpAppReviveQuery, McpAppsService } from './mcp-apps.service'

@ApiTags('MCP Apps')
@ApiBearerAuth()
@Controller('mcp-apps')
export class McpAppsController {
    constructor(private readonly service: McpAppsService) {}

    @Get(':appInstanceId/resource')
    async getResource(@Param('appInstanceId') appInstanceId: string, @Query() query: McpAppReviveQuery) {
        return this.service.getResource(appInstanceId, query)
    }

    @Post(':appInstanceId/rpc')
    async rpc(@Param('appInstanceId') appInstanceId: string, @Query() query: McpAppReviveQuery, @Body() body: unknown) {
        return this.service.handleRpc(appInstanceId, body as never, query)
    }
}
