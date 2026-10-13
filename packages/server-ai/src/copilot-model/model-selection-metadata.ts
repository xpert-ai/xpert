import { ModelPropertyKey, ModelSelectionMetadata, ProviderModel, resolveI18nText } from '@xpert-ai/contracts'
import type { CopilotWithProviderDto } from '../copilot/dto'
import { providerIconUrls } from '../ai-model/dto/provider.dto'

// Project only display metadata from the already-authorized catalog, never provider configuration.
export function modelSelectionMetadata(
    copilot: CopilotWithProviderDto,
    model: ProviderModel,
    language: string
): ModelSelectionMetadata {
    const provider = copilot.providerWithModels
    const iconUrl =
        resolveI18nText(providerIconUrls(provider, 'icon_small', provider.icon_small), language) ||
        resolveI18nText(providerIconUrls(provider, 'icon_large', provider.icon_large), language)
    return {
        provider: {
            id: provider.provider || copilot.id,
            label: resolveI18nText(provider.label, language) || provider.provider || copilot.name || copilot.id,
            ...(iconUrl ? { iconUrl } : {})
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
