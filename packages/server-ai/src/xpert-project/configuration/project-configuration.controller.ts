import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum, projectConfigurationUpdateSchema, type ProjectConfigurationUpdate } from '@xpert-ai/contracts'
import { Permissions, ZodValidationPipe } from '@xpert-ai/server-core'
import { XpertProjectGuard, ProjectPermission } from '../guards'
import { ProjectConfigurationService } from './project-configuration.service'
import { configurationInvalid } from './project-configuration.schema'

@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectConfigurationController {
    constructor(private readonly configurations: ProjectConfigurationService) {}
    @Get(':id/type-configuration')
    @Permissions(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    get(@Param('id') projectId: string) { return this.configurations.get(projectId) }

    @Put(':id/type-configuration')
    @Permissions(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    update(@Param('id') projectId: string,
        @Body(new ZodValidationPipe(projectConfigurationUpdateSchema, configurationInvalid)) input: ProjectConfigurationUpdate) {
        return this.configurations.update(projectId, input)
    }
}
