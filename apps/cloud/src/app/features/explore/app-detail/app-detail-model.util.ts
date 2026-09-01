import { AiModelTypeEnum, ICopilotModel, PluginApplicationModelOption } from '@xpert-ai/contracts'

/** Adapts a server-authorized preflight option to the shared model-select value. */
export function pluginApplicationCopilotModel(
  option: PluginApplicationModelOption | undefined,
  fallbackModelType: AiModelTypeEnum
): Partial<ICopilotModel> | null {
  if (!option) {
    return null
  }

  return {
    copilotId: option.copilotId,
    model: option.model,
    modelType: option.modelType || fallbackModelType
  }
}

/** Selects the server-authorized organization default, falling back only when no eligible default exists. */
export function pluginApplicationDefaultCopilotModel(
  options: PluginApplicationModelOption[],
  defaultModelId: string | null | undefined,
  fallbackModelType: AiModelTypeEnum
): Partial<ICopilotModel> | null {
  const option = (defaultModelId ? options.find((item) => item.id === defaultModelId) : undefined) ?? options[0]
  return pluginApplicationCopilotModel(option, fallbackModelType)
}

/** Serializes the model-select value to the opaque option ID validated by the server. */
export function pluginApplicationModelId(model: Partial<ICopilotModel> | null): string | null {
  const copilotId = model?.copilotId?.trim()
  const modelName = model?.model?.trim()
  return copilotId && modelName ? `${copilotId}/${encodeURIComponent(modelName)}` : null
}
