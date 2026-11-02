import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { TenantScopeGuard, TransformInterceptor } from '@xpert-ai/server-core'
import { CopilotWithProviderDto } from '../dto'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../queries/copilot-model-find.query'

// Global authentication and live scope checks precede per-user model authorization.
// Keep this separate from the provider-management controller and its inherited CRUD routes.
@ApiTags('Copilot')
@ApiBearerAuth()
@Controller('models')
@UseGuards(TenantScopeGuard)
@UseInterceptors(TransformInterceptor)
export class CopilotModelCatalogController {
    constructor(private readonly queryBus: QueryBus) {}

    @Get()
    async getModels(@Query('type') type: AiModelTypeEnum): Promise<CopilotWithProviderDto[]> {
        return this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
            new FindCopilotModelsQuery(type, CopilotModelCatalogMode.Available)
        )
    }
}
