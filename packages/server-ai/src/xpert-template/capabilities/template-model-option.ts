import { AiModelTypeEnum, ProviderModel, XpertTemplateModelOption, resolveI18nText } from '@xpert-ai/contracts'
import { CopilotWithProviderDto } from '../../copilot/dto'
import { modelSelectionMetadata } from '../../copilot-model/model-selection-metadata'

// Project only public display metadata from the already-governed model catalog.
export function templateModelOption(
    copilot: CopilotWithProviderDto,
    model: ProviderModel,
    language: string
): XpertTemplateModelOption {
    return {
        id: `${copilot.id}/${encodeURIComponent(model.model)}`,
        label: resolveI18nText(model.label, language) || model.model,
        copilotModel: { copilotId: copilot.id, model: model.model, modelType: AiModelTypeEnum.LLM },
        ...modelSelectionMetadata(copilot, model, language)
    }
}
