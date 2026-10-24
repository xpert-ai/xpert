import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod/v3'
import { t } from 'i18next'
import {
    AIPermissionsEnum,
    projectPipelineCatalogConfigureSchema,
    type ProjectPipelineCatalogConfigure
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { ProjectPipelineCatalogService } from './pipeline-catalog.service'
import { pipelineBindingsPageInput, pipelineCatalogQuery } from './pipeline-bindings.service'

const invalid = () => new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))
@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectPipelineCatalogController {
    constructor(private readonly catalog: ProjectPipelineCatalogService) {}
    private context(projectId: string) {
        return {
            projectId,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        }
    }
    @Get(':id/pipelines/catalog')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    list(
        @Param('id') id: string,
        @Query(new ZodValidationPipe(pipelineCatalogQuery, invalid)) input: z.output<typeof pipelineCatalogQuery>
    ) {
        return this.catalog.list(this.context(id), input)
    }
    @Post(':id/pipelines/catalog/configure')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    configure(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineCatalogConfigureSchema, invalid))
        input: ProjectPipelineCatalogConfigure
    ) {
        return this.catalog.configure(this.context(id), input)
    }
    @Get(':id/pipelines/configurations')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    bindings(
        @Param('id') id: string,
        @Query(new ZodValidationPipe(pipelineBindingsPageInput, invalid))
        input: z.output<typeof pipelineBindingsPageInput>
    ) {
        return this.catalog.bindings(this.context(id), input)
    }
    @Get(':id/pipelines/configurations/:bindingId')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    binding(
        @Param('id') id: string,
        @Param('bindingId', new ZodValidationPipe(z.string().uuid(), invalid)) bindingId: string,
        @Query(new ZodValidationPipe(pipelineCatalogQuery, invalid)) input: z.output<typeof pipelineCatalogQuery>
    ) {
        return this.catalog.binding(this.context(id), bindingId, input)
    }
}
