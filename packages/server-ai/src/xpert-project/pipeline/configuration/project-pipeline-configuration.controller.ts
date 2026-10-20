import { BadRequestException, Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import {
    AIPermissionsEnum,
    projectPipelineConfigurationSchema,
    type ProjectPipelineConfiguration
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { ProjectPipelineConfigurationService } from './project-pipeline-configuration.service'

@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectPipelineConfigurationController {
    constructor(private readonly configurations: ProjectPipelineConfigurationService) {}

    @Post(':id/pipelines/configuration/check')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    check(
        @Param('id') projectId: string,
        @Body(
            new ZodValidationPipe(
                projectPipelineConfigurationSchema,
                (error) =>
                    new BadRequestException({
                        message: t('server-ai:Error.ProjectPipelineConfigurationInvalid'),
                        // Never echo parameter values, plugin payloads or raw Zod issues to clients.
                        issues: error.issues.map((issue) => ({
                            path: issue.path,
                            code:
                                issue.code === 'custom' && /^[A-Z_]+$/.test(issue.message) ? issue.message : issue.code
                        }))
                    })
            )
        )
        configuration: ProjectPipelineConfiguration
    ) {
        return this.configurations.check(
            {
                projectId,
                actor: {
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId(),
                    userId: RequestContext.currentUserId()
                }
            },
            configuration
        )
    }
}
