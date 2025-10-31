import { Embeddings } from '@langchain/core/embeddings'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIModelEntity, AiModelTypeEnum, IAiProviderEntity, ICopilotModel, ProviderModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { join } from 'path'
import { loadYamlFile } from '../core'
import { AIModel } from './ai-model'
import { AI_MODEL_PROVIDER } from './ai-model-provider.decorator'
import { IAIModelProviderStrategy } from './ai-model-provider.interface'
import { AiModelNotFoundException } from './errors'
import { SpeechToTextModel } from './speech2text'
import { TextToSpeechModel } from './tts'
import { TChatModelOptions, TextEmbeddingModelManager, IRerank, RerankModel } from './types/'


@Injectable()
export abstract class ModelProvider implements IAIModelProviderStrategy {
  readonly logger = new Logger(ModelProvider.name)

  protected _name: string
  protected _meta: IAiProviderEntity
  get name(): string {
    return this.getProviderSchema().provider
  }
  // protected providerSchema: IAiProviderEntity | null = null

  protected modelManagers: Map<AiModelTypeEnum, AIModel> = new Map()
  private dir: string

  constructor() {
    const provider = Reflect.getMetadata(AI_MODEL_PROVIDER, this.constructor)
    this._name = provider
    // Automatically retrieve provider DIR information from decorator metadata
    const dir = Reflect.getMetadata(`${AI_MODEL_PROVIDER}_DIR`, this.constructor)
    this.dir = dir
  }

  async validateCredentials(credentials: Record<string, any>): Promise<void> {
    await this.validateProviderCredentials(credentials)
  }

  abstract getAuthorization(credentials: Record<string, any>): string
  abstract getBaseUrl(credentials: Record<string, any>): string
  abstract validateProviderCredentials(credentials: Record<string, any>): Promise<void>

  /**
   * Get provider lib root path.
   *
   * @returns Root of library
   */
  getProviderServerPath() {
    return this.dir
  }

  getProviderSchema(): IAiProviderEntity {
    if (this._meta) {
      return this._meta
    }

    const yamlPath = join(this.getProviderServerPath(), `${this._name}.yaml`)

    const yamlData = loadYamlFile(yamlPath, this.logger) as Record<string, any>

    try {
      this._meta = yamlData as IAiProviderEntity
    } catch (e: any) {
      throw new Error(`Invalid provider schema for ${this.name}: ${e.message}`)
    }

    return this._meta
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
  ): Promise<BaseLanguageModel | BaseChatModel | Embeddings | IRerank> {
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
      case AiModelTypeEnum.RERANK:
        return this.getModelManager<RerankModel>(type)?.getDocumentCompressor(copilotModel, options)
    }

    return null
  }
}
