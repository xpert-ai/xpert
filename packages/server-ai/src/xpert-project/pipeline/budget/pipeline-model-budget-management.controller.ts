import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards
} from '@nestjs/common'
import {
    AIPermissionsEnum,
    projectPipelineModelBudgetIncreaseSchema,
    type ProjectPipelineModelBudgetIncrease
} from '@xpert-ai/contracts'
import { Permissions, ZodValidationPipe } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ProjectPermission, XpertProjectGuard } from '../../guards'
import { ProjectPipelineModelBudgetManagementService } from './pipeline-model-budget-management.service'

@Controller()
@UseGuards(XpertProjectGuard)
@Permissions(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
export class ProjectPipelineModelBudgetManagementController {
    constructor(private readonly budgets: ProjectPipelineModelBudgetManagementService) {}
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
    @Post(':id/pipelines/native-model-budget/increases')
    @HttpCode(200)
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    increase(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body(
            new ZodValidationPipe(
                projectPipelineModelBudgetIncreaseSchema,
                () => new BadRequestException(t('server-ai:Error.ProjectPipelineConfigurationInvalid'))
            )
        )
        input: ProjectPipelineModelBudgetIncrease
    ) {
        return this.budgets.increase(this.context(id), input)
    }
    @Get(':id/pipelines/:instanceId/native-model-budget')
    @ProjectPermission(AIPermissionsEnum.XPERT_PROJECT_MANAGE)
    inspect(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Param('instanceId', new ParseUUIDPipe()) instanceId: string
    ) {
        return this.budgets.inspect(this.context(id), instanceId)
    }
}
