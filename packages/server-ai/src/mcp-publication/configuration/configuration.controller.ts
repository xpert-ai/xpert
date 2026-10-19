import { Body, Controller, Get, Param, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { RolesEnum } from '@xpert-ai/contracts'
import { RoleGuard, Roles } from '@xpert-ai/server-core'
import { McpSourceConfigurationService } from './configuration.service'
import { UpdateMcpSourceConfigurationInput } from './configuration.dto'

@Controller('mcp-publications/:id/plugin-configurations')
@UseGuards(RoleGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@UsePipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }))
export class McpSourceConfigurationController {
    constructor(private readonly configurations: McpSourceConfigurationService) {}

    @Get()
    tabs(@Param('id') id: string) {
        return this.configurations.tabs(id)
    }

    @Get(':toolsetId')
    get(@Param('id') id: string, @Param('toolsetId') toolsetId: string) {
        return this.configurations.get(id, toolsetId)
    }

    @Put(':toolsetId')
    update(
        @Param('id') id: string,
        @Param('toolsetId') toolsetId: string,
        @Body() input: UpdateMcpSourceConfigurationInput
    ) {
        return this.configurations.update(id, toolsetId, input)
    }
}
