import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { t } from 'i18next'
import {
    AIPermissionsEnum,
    projectPipelineAnalyticsInputSchema,
    type ProjectPipelineAnalyticsInput
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { ProjectPipelineAnalyticsService } from './pipeline-analytics.service'

@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectPipelineAnalyticsController {
    constructor(private readonly analytics: ProjectPipelineAnalyticsService) {}
    @Get(':id/pipelines/analytics')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    read(
        @Param('id') projectId: string,
        @Query(
            new ZodValidationPipe(
                projectPipelineAnalyticsInputSchema,
                () => new BadRequestException(t('server-ai:Error.ProjectPipelineAnalyticsWindowInvalid'))
            )
        )
        input: ProjectPipelineAnalyticsInput
    ) {
        return this.analytics.read(
            {
                projectId,
                actor: {
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId(),
                    userId: RequestContext.currentUserId()
                }
            },
            input
        )
    }
}
