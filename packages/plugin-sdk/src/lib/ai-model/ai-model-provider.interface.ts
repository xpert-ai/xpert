import {
  AiModelTypeEnum,
  IAiProviderEntity,
  ICopilotModel,
  ProviderModel,
  AIModelEntity
} from '@metad/contracts'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IRerank } from './types'
import { AIModel } from './ai-model'

export interface IAIModelProviderStrategy {
  /**
   * Provider metadata
   */
  // meta: IAiProviderEntity

  /**
   * Validate whether the credentials are valid
   */
  validateCredentials(credentials: Record<string, any>): Promise<void>
  /**
   * @deprecated use validateCredentials instead
   */
  validateProviderCredentials(credentials: Record<string, any>): Promise<void>

  /**
   * Get the provider's Base URL
   */
  getBaseUrl(credentials: Record<string, any>): string

  /**
   * Get authorization information, such as API Key, Token, etc.
   */
  getAuthorization(credentials: Record<string, any>): string

  /**
   * Get the list of models supported by the provider
   */
  getModels(modelType: AiModelTypeEnum): Promise<AIModelEntity[]>

  /**
   * Return a directly usable model instance (LLM / Embedding / TTS / Rerank)
   */
  getModelInstance(
    type: AiModelTypeEnum,
    copilotModel: ICopilotModel,
    options?: Record<string, any>
  ): Promise<BaseLanguageModel | BaseChatModel | Embeddings | IRerank>

  /**
   * Return the defined provider models (metadata)
   */
  getProviderModels?(modelType?: AiModelTypeEnum, onlyActive?: boolean): ProviderModel[]

  getProviderSchema(): IAiProviderEntity
  getProviderServerPath(): string
  getModelManager<T extends AIModel>(modelType: AiModelTypeEnum): T
}
