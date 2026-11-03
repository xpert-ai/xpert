import { ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, ParameterRule } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { CopilotProviderModelParameterRulesQuery } from '../../copilot-provider/queries/model-parameter-rules.query'
import { CopilotWithProviderDto } from '../dto'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../queries/copilot-model-find.query'
import { ModelParameterRulesInput } from './model-parameter-rules.schema'

@Injectable()
export class CopilotModelCatalogService {
    constructor(private readonly queryBus: QueryBus) {}

    getModels(type: AiModelTypeEnum): Promise<CopilotWithProviderDto[]> {
        return this.queryBus.execute(new FindCopilotModelsQuery(type, CopilotModelCatalogMode.Available))
    }

    async getParameterRules(copilotId: string, input: ModelParameterRulesInput): Promise<ParameterRule[]> {
        // Recheck the live, scoped catalog; client-supplied provider IDs cannot establish model access.
        const catalog = await this.getModels(input.modelType)
        const connection = catalog.find((item) => item.id === copilotId)
        const model = connection?.providerWithModels.models.find(
            (item) => item.model === input.model && item.model_type === input.modelType
        )
        if (!model || !connection.modelProvider?.id) {
            throw new ForbiddenException({
                code: 'model_parameter_rules_forbidden',
                message: t('server-ai:Error.ModelParameterRulesForbidden')
            })
        }
        return this.queryBus.execute(
            new CopilotProviderModelParameterRulesQuery(connection.modelProvider.id, input.modelType, input.model)
        )
    }
}
