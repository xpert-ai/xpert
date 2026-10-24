import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { AIPermissionsEnum, projectPipelineProviderActionCommandSchema } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { ProjectPipelineProviderActionsService } from './provider-actions.service'

const invalid = () => new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))
const identity = () => new ZodValidationPipe(z.string().uuid(), invalid)
@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectPipelineProviderActionsController {
    constructor(private readonly actions: ProjectPipelineProviderActionsService) {}
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
    @Get(':id/pipelines/:instanceId/nodes/:nodeInstanceId/actions')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    list(
        @Param('id') id: string,
        @Param('instanceId', identity()) instanceId: string,
        @Param('nodeInstanceId', identity()) nodeInstanceId: string
    ) {
        return this.actions.list(this.context(id), { instanceId, nodeInstanceId })
    }
    @Post(':id/pipelines/provider-actions')
    @HttpCode(202)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    submit(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineProviderActionCommandSchema, invalid))
        input: z.output<typeof projectPipelineProviderActionCommandSchema>
    ) {
        return this.actions.submit(this.context(id), input)
    }
}
