import { ICopilotModel, ModelPropertyKey } from '@metad/contracts'
import { normalizeContextSize } from '@xpert-ai/plugin-sdk'
import { ModelProvider } from '../../ai-model'

type TCustomModel = {
	modelProperties?: Record<string, any>
}

export function ensureCopilotModelContextSize(
	copilotModel: ICopilotModel,
	modelProvider: ModelProvider,
	modelName?: string,
	customModels?: TCustomModel[]
): number | undefined {
	if (!copilotModel) {
		return
	}

	const currentContextSize = normalizeContextSize(copilotModel.options?.context_size)
	if (typeof currentContextSize === 'number') {
		copilotModel.options = {
			...(copilotModel.options ?? {}),
			context_size: currentContextSize
		}
		return currentContextSize
	}

	const customModelContextSize = normalizeContextSize(customModels?.[0]?.modelProperties?.[ModelPropertyKey.CONTEXT_SIZE])
	const predefinedModelContextSize = modelName
		? normalizeContextSize(
				modelProvider
					.getProviderModels(copilotModel.modelType)
					.find((model) => model.model === modelName)?.model_properties?.[ModelPropertyKey.CONTEXT_SIZE]
		  )
		: undefined

	const contextSize = customModelContextSize ?? predefinedModelContextSize
	if (typeof contextSize === 'number') {
		copilotModel.options = {
			...(copilotModel.options ?? {}),
			[ModelPropertyKey.CONTEXT_SIZE]: contextSize
		}
	}

	return contextSize
}
