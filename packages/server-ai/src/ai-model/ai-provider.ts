import { Embeddings } from '@langchain/core/embeddings'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIModelEntity, AiModelTypeEnum, IAiProviderEntity, ICopilotModel, ProviderModel } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { loadYamlFile } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import * as path from 'path'
import { AIModel } from './ai-model'
import { AIProviderRegistry } from './registry'
import { TextEmbeddingModelManager } from './types/text-embedding-model'
import { ModelProvidersFolderPath, TChatModelOptions } from './types/types'
import { AiModelNotFoundException } from '../core/errors'
import { TextToSpeechModel } from './tts'
import { SpeechToTextModel } from './speech2text'

@Injectable()
export abstract class ModelProvider {
	protected logger = new Logger(this.constructor.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	protected providerSchema: IAiProviderEntity | null = null

	protected modelManagers: Map<AiModelTypeEnum, AIModel> = new Map()

	constructor(public name: string) {
		AIProviderRegistry.getInstance().registerProvider(this)
	}

	abstract getAuthorization(credentials: Record<string, any>): string;
	abstract getBaseUrl(credentials: Record<string, any>): string;
	abstract validateProviderCredentials(credentials: Record<string, any>): Promise<void>


	getProviderServerPath() {
		return path.join(this.configService.assetOptions.serverRoot, ModelProvidersFolderPath, this.name)
	}

	getProviderSchema(): IAiProviderEntity {
		if (this.providerSchema) {
			return this.providerSchema
		}

		const yamlPath = path.join(this.getProviderServerPath(), `${this.name}.yaml`)

		const yamlData = loadYamlFile(yamlPath, this.logger) as Record<string, any>

		try {
			this.providerSchema = yamlData as IAiProviderEntity
		} catch (e) {
			throw new Error(`Invalid provider schema for ${this.name}: ${e.message}`)
		}

		return this.providerSchema
	}

	async getModels(modelType: AiModelTypeEnum): Promise<AIModelEntity[]> {
		const providerSchema = this.getProviderSchema()
		if (!providerSchema.supported_model_types.includes(modelType)) {
			return []
		}

		const modelInstance = this.getModelManager(modelType)
		return modelInstance.predefinedModels()
	}

	registerAIModelInstance(modelType: AiModelTypeEnum, modelInstance: AIModel): void {
		this.modelManagers.set(modelType, modelInstance)
	}

	getModelManager<T extends AIModel>(modelType: AiModelTypeEnum): T {
		const modelInstance = this.modelManagers.get(modelType)

		if (!modelInstance) {
			throw new AiModelNotFoundException(`Missing AIModel instance for model type ${modelType}`)
		}

		return modelInstance as T
	}

	/**
	 * Get provider models.
	 * @param modelType - model type
	 * @param onlyActive - only active models
	 * @return provider models
	 */
	getProviderModels(modelType?: AiModelTypeEnum, onlyActive = false): ProviderModel[] {
		let modelTypes: AiModelTypeEnum[] = []
		if (modelType) {
			modelTypes.push(modelType)
		} else {
			modelTypes = this.getProviderSchema().supported_model_types
		}

		const providerModels: AIModelEntity[] = this.getSystemProviderModels(modelTypes)

		if (onlyActive) {
			// providerModels = providerModels.filter(m => m.status === ModelStatus.ACTIVE);
		}

		// Resort providerModels
		return providerModels.sort((a, b) => a.model_type.localeCompare(b.model_type))
	}

	getSystemProviderModels(modelTypes: AiModelTypeEnum[]) {
		const models = []
		modelTypes?.forEach((modelType) => {
			const modelManager = this.modelManagers.get(modelType)
			if (modelManager) {
				models.push(...modelManager.predefinedModels())
			}
		})
		return models
	}

	getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		return this.getModelManager(AiModelTypeEnum.LLM)?.getChatModel(copilotModel, options)
	}

	async getModelInstance(
		type: AiModelTypeEnum,
		copilotModel: ICopilotModel,
		options?: TChatModelOptions
	): Promise<BaseLanguageModel | BaseChatModel | Embeddings> {
		switch (type) {
			case AiModelTypeEnum.LLM:
				return this.getModelManager(type)?.getChatModel(copilotModel, options)
			case AiModelTypeEnum.TEXT_EMBEDDING:
				if (!copilotModel.options) {
					const predefinedModels = await this.getModels(AiModelTypeEnum.TEXT_EMBEDDING)
					const modelName = copilotModel.model || copilotModel.copilot.copilotModel?.model
					copilotModel.options = predefinedModels.find((_) => _.model === modelName)?.model_properties
				}
				return this.getModelManager<TextEmbeddingModelManager>(type)?.getEmbeddingInstance(copilotModel, options)
			case AiModelTypeEnum.TTS:
				return this.getModelManager<TextToSpeechModel>(type)?.getChatModel(copilotModel, options)
			case AiModelTypeEnum.SPEECH2TEXT:
				return this.getModelManager<SpeechToTextModel>(type)?.getChatModel(copilotModel, options)
		}
		
		return null
	}
}
