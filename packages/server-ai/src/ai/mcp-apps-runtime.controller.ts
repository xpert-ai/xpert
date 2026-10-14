import { t } from 'i18next'
import { McpAppHistoryQuery, mcpAppHistoryQuerySchema } from '../mcp-app-runtime/mcp-app-history.schema'
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard, Public, ZodValidationPipe } from '@xpert-ai/server-core'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { McpAppReviveQuery, McpAppsService } from '../xpert-toolset/mcp-apps.service'

/** ChatKit entry point; management routes retain the platform's ordinary authorization. */
@ApiTags('MCP Apps')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('mcp-apps')
export class McpAppsRuntimeController {
    constructor(private readonly service: McpAppsService) {}

    @Get(':appInstanceId/history')
    getHistory(
        @Param('appInstanceId') appInstanceId: string,
        @Query(
            new ZodValidationPipe(
                mcpAppHistoryQuerySchema,
                () =>
                    new BadRequestException(
                        t('server-ai:Error.McpAppHistoryQueryInvalid', {
                            defaultValue: 'A valid message identifier is required.'
                        })
                    )
            )
        )
        query: McpAppHistoryQuery
    ) {
        return this.service.getHistory(appInstanceId, query.messageId)
    }

    @Post(':appInstanceId/resume')
    resume(
        @Param('appInstanceId') appInstanceId: string,
        @Query(
            new ZodValidationPipe(
                mcpAppHistoryQuerySchema,
                () =>
                    new BadRequestException(
                        t('server-ai:Error.McpAppHistoryQueryInvalid', {
                            defaultValue: 'A valid message identifier is required.'
                        })
                    )
            )
        )
        query: McpAppHistoryQuery
    ) {
        return this.service.resume(appInstanceId, query.messageId)
    }

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
