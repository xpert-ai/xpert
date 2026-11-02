import { PluginMarketplaceAppModelRequirements } from '@xpert-ai/contracts'
import { PlatformModels } from './platform-models.service'
import { platformFailure } from './platform-error'

/** App tools can require an exact auxiliary model even when the main Assistant has a valid LLM. */
export function assertPlatformModelRequirements(
    models: PlatformModels,
    requirements?: PluginMarketplaceAppModelRequirements
) {
    if (
        (requirements?.embedding && !models.embeddingModelId) ||
        (requirements?.vision && !models.visionModelId) ||
        (requirements?.speechToText && !models.speechToTextModelId)
    )
        throw platformFailure('application_model_binding_unavailable')
    for (const required of requirements?.auxiliary ?? []) {
        if (
            !models.billingModels.some(
                (selected) =>
                    selected.provider === required.provider &&
                    selected.model === required.model &&
                    selected.modelType === required.modelType
            )
        )
            throw platformFailure('application_model_binding_unavailable')
    }
}
