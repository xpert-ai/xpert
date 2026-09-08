import { ICopilotModel, ModelPropertyKey } from '@xpert-ai/contracts'
import { IAIModelProviderStrategy, normalizeContextSize } from '@xpert-ai/plugin-sdk'

type TCustomModel = {
    modelProperties?: Record<string, any>
}

export function ensureCopilotModelContextSize(
    copilotModel: ICopilotModel,
    modelProvider: Pick<IAIModelProviderStrategy, 'getProviderModels'>,
    modelName?: string,
    customModels?: TCustomModel[]
): number | undefined {
    if (!copilotModel) {
        return
    }

    const currentContextSize = normalizeContextSize(copilotModel.options?.context_size)
    if (typeof currentContextSize === 'number' && copilotModel.options?.context_size_source !== 'provider') {
        copilotModel.options = {
            ...(copilotModel.options ?? {}),
            context_size: currentContextSize
        }
        return currentContextSize
    }

    const customModelContextSize = normalizeContextSize(
        customModels?.[0]?.modelProperties?.[ModelPropertyKey.CONTEXT_SIZE]
    )
    const predefinedModelContextSize = modelName
        ? normalizeContextSize(
              modelProvider.getProviderModels(copilotModel.modelType).find((model) => model.model === modelName)
                  ?.model_properties?.[ModelPropertyKey.CONTEXT_SIZE]
          )
        : undefined

    const contextSize = customModelContextSize ?? predefinedModelContextSize ?? currentContextSize
    if (typeof contextSize === 'number') {
        copilotModel.options = {
            ...(copilotModel.options ?? {}),
            [ModelPropertyKey.CONTEXT_SIZE]: contextSize,
            context_size_source: 'provider'
        }
    }

    return contextSize
}
