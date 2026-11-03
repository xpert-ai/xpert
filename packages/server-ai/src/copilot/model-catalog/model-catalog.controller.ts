import { BadRequestException, Controller, Get, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AiModelTypeEnum, ParameterRule } from '@xpert-ai/contracts'
import { TenantScopeGuard, TransformInterceptor, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { CopilotWithProviderDto } from '../dto'
import { CopilotModelCatalogService } from './model-catalog.service'
import { ModelParameterRulesInput, modelParameterRulesSchema } from './model-parameter-rules.schema'

// Global authentication and live scope checks precede per-user model authorization.
// Keep this separate from the provider-management controller and its inherited CRUD routes.
@ApiTags('Copilot')
@ApiBearerAuth()
@Controller('models')
@UseGuards(TenantScopeGuard)
@UseInterceptors(TransformInterceptor)
export class CopilotModelCatalogController {
    constructor(private readonly service: CopilotModelCatalogService) {}

    @Get()
    async getModels(@Query('type') type: AiModelTypeEnum): Promise<CopilotWithProviderDto[]> {
        return this.service.getModels(type)
    }

    @Get(':copilotId/parameter-rules')
    getParameterRules(
        @Param('copilotId', UUIDValidationPipe) copilotId: string,
        @Query(
            new ZodValidationPipe(
                modelParameterRulesSchema,
                () =>
                    new BadRequestException({
                        code: 'model_parameter_rules_invalid',
                        message: t('server-ai:Error.ModelParameterRulesInvalid')
                    })
            )
        )
        input: ModelParameterRulesInput
    ): Promise<ParameterRule[]> {
        return this.service.getParameterRules(copilotId, input)
    }
}
