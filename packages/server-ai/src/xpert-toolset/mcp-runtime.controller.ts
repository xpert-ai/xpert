import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { McpRuntimeListFilter, mcpStdioRuntimeManager } from './provider/mcp/mcp-stdio-runtime'
import { McpRuntimeAuditListQuery, McpRuntimeAuditService } from './mcp-runtime-audit.service'

@ApiTags('MCP Runtime')
@ApiBearerAuth()
@Controller('operations/mcp-runtimes')
export class McpRuntimeController {
    constructor(private readonly runtimeAuditService: McpRuntimeAuditService) {}

    @Get()
    async list(@Query() query: McpRuntimeAuditListQuery) {
        this.assertSuperAdmin()
        return this.runtimeAuditService.list(
            query,
            mcpStdioRuntimeManager.list(this.runtimeAuditService.toRuntimeManagerFilter(query))
        )
    }

    @Post(':runtimeId/stop')
    async stop(@Param('runtimeId') runtimeId: string) {
        this.assertSuperAdmin()
        return {
            stopped: await mcpStdioRuntimeManager.closeRuntime(runtimeId, 'admin-stop')
        }
    }

    @Post('kill')
    async kill(@Body() body: McpRuntimeListFilter) {
        this.assertSuperAdmin()
        return {
            stopped: await mcpStdioRuntimeManager.killByFilter(
                this.runtimeAuditService.toRuntimeManagerFilter(body ?? {}),
                'admin-kill'
            )
        }
    }

    private assertSuperAdmin() {
        if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
            throw new ForbiddenException('Only SUPER_ADMIN users can manage MCP stdio runtimes')
        }
    }
}
