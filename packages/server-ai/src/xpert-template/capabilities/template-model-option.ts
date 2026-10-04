import {
    AiModelTypeEnum,
    ModelPropertyKey,
    ProviderModel,
    XpertTemplateModelOption,
    resolveI18nText
} from '@xpert-ai/contracts'
import { CopilotWithProviderDto } from '../../copilot/dto'

// Project only public display metadata from the already-governed model catalog.
export function templateModelOption(
    copilot: CopilotWithProviderDto,
    model: ProviderModel,
    language: string
): XpertTemplateModelOption {
    const provider = copilot.providerWithModels
    return {
        id: `${copilot.id}/${encodeURIComponent(model.model)}`,
        label: resolveI18nText(model.label, language) || model.model,
        copilotModel: { copilotId: copilot.id, model: model.model, modelType: AiModelTypeEnum.LLM },
        provider: {
            id: provider.provider || copilot.id,
            label: resolveI18nText(provider.label, language) || provider.provider || copilot.name || copilot.id
        },
        connectionName: copilot.name,
        features: model.features ?? [],
        contextWindow: contextWindow(model.model_properties?.[ModelPropertyKey.CONTEXT_SIZE])
    }
}

function contextWindow(value: unknown): number | undefined {
    const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
    return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : undefined
}
