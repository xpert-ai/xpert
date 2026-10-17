import { AiModelTypeEnum, ModelFeature, PluginApplicationModelOption } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotWithProviderDto } from '../copilot/dto'
import { FindCopilotModelsQuery } from '../copilot/queries'
import { modelSelectionMetadata } from '../copilot-model/model-selection-metadata'

/** Returns only models visible through the current request's governed model query. */
export async function applicationModelOptions(
    queries: QueryBus,
    modelType: AiModelTypeEnum,
    requiredFeature?: ModelFeature
): Promise<PluginApplicationModelOption[]> {
    const copilots = await queries.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
        new FindCopilotModelsQuery(modelType)
    )
    return copilots.flatMap((copilot) =>
        copilot.providerWithModels.models
            .filter(
                (model) =>
                    model.model_type === modelType && (!requiredFeature || model.features?.includes(requiredFeature))
            )
            .map((model) => ({
                id: `${copilot.id}/${encodeURIComponent(model.model)}`,
                copilotId: copilot.id,
                model: model.model,
                label: model.label,
                modelType: model.model_type,
                ...modelSelectionMetadata(copilot, model, RequestContext.getLanguageCode())
            }))
    )
}
