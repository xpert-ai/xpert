import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
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
        return this.service.handleRpc(appInstanceId, body, query)
    }

    @Post(':appInstanceId/approvals/:approvalId/approve')
    approve(
        @Param('appInstanceId') appInstanceId: string,
        @Param('approvalId') approvalId: string,
        @Query() query: McpAppReviveQuery
    ) {
        return this.service.approve(appInstanceId, approvalId, query)
    }

    @Post(':appInstanceId/approvals/:approvalId/reject')
    reject(
        @Param('appInstanceId') appInstanceId: string,
        @Param('approvalId') approvalId: string,
        @Query() query: McpAppReviveQuery
    ) {
        return this.service.reject(appInstanceId, approvalId, query)
    }

    @Delete(':appInstanceId')
    teardown(@Param('appInstanceId') appInstanceId: string, @Query() query: McpAppReviveQuery) {
        return this.service.teardown(appInstanceId, query)
    }
}
