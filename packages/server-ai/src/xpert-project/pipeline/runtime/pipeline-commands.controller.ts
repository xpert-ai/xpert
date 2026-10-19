import { BadRequestException, Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { t } from 'i18next'
import {
    AIPermissionsEnum,
    projectPipelineConfigureSchema,
    projectPipelineStartSchema,
    projectPipelineDecisionSchema,
    projectPipelineNextRoundSchema,
    type ProjectPipelineNextRound,
    projectPipelineCancelSchema,
    projectPipelineRetrySchema,
    type ProjectPipelineCancel,
    type ProjectPipelineRetry,
    type ProjectPipelineConfigure,
    type ProjectPipelineStart,
    type ProjectPipelineDecision
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ZodValidationPipe } from '@xpert-ai/server-core'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { ProjectPipelineCommandsService } from './pipeline-commands.service'

const invalid = () => new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))
@Controller()
@UseGuards(XpertProjectGuard)
export class ProjectPipelineCommandsController {
    constructor(private readonly commands: ProjectPipelineCommandsService) {}
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
    @Post(':id/pipelines/configure')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    configure(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineConfigureSchema, invalid)) input: ProjectPipelineConfigure
    ) {
        return this.commands.configure(this.context(id), input)
    }
    @Post(':id/pipelines/start')
    @HttpCode(202)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    start(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineStartSchema, invalid)) input: ProjectPipelineStart
    ) {
        return this.commands.start(this.context(id), input)
    }
    @Post(':id/pipelines/decisions')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    decide(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineDecisionSchema, invalid)) input: ProjectPipelineDecision
    ) {
        return this.commands.decide(this.context(id), input)
    }
    @Post(':id/pipelines/next-round')
    @HttpCode(202)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    nextRound(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineNextRoundSchema, invalid)) input: ProjectPipelineNextRound
    ) {
        return this.commands.nextRound(this.context(id), input)
    }
    @Post(':id/pipelines/cancel')
    @HttpCode(202)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    cancel(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineCancelSchema, invalid)) input: ProjectPipelineCancel
    ) {
        return this.commands.cancel(this.context(id), input)
    }
    @Post(':id/pipelines/retry')
    @HttpCode(202)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    retry(
        @Param('id') id: string,
        @Body(new ZodValidationPipe(projectPipelineRetrySchema, invalid)) input: ProjectPipelineRetry
    ) {
        return this.commands.retry(this.context(id), input)
    }
}
