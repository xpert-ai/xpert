import {
    EnabledModelSelection,
    ICopilotProvider,
    ICopilotProviderModel,
    isConfiguredModelAvailable,
    modelIdentityKey,
    ProviderModel
} from '@xpert-ai/contracts'

/** Freeze a legacy catalog before adding models, so discovery never implicitly grants new models. */
export function snapshotEnabledModels(
    provider: Pick<ICopilotProvider, 'options'>,
    builtin: ProviderModel[],
    custom: ICopilotProviderModel[]
): EnabledModelSelection[] {
    if (provider.options?.enabledModels !== undefined) return provider.options.enabledModels
    const models = new Map<string, EnabledModelSelection>()
    for (const item of builtin) {
        if (item.deprecated || !isConfiguredModelAvailable(provider, null)) continue
        const model = { model: item.model, modelType: item.model_type }
        models.set(modelIdentityKey(model), model)
    }
    for (const item of custom) {
        const model = { model: item.modelName, modelType: item.modelType }
        if (!model.model || !model.modelType) continue
        if (item.isValid === false || !isConfiguredModelAvailable(provider, item))
            models.delete(modelIdentityKey(model))
        else models.set(modelIdentityKey(model), model)
    }
    return [...models.values()]
}
