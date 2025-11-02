import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  getErrorMessage,
  IRerank,
  OpenAICompatibleReranker,
  RerankModel,
  TChatModelOptions,
  TModelProperties
} from '@xpert-ai/plugin-sdk'
import { VLLMProviderStrategy } from '../provider.strategy'

@Injectable()
export class VLLMRerankModel extends RerankModel {
  constructor(modelProvider: VLLMProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  override async validateCredentials(model: string, credentials: Record<string, any>) {
    const _credentials = credentials ?? {} as TModelProperties
    const reranker = new OpenAICompatibleReranker({
      endpointUrl: _credentials.endpoint_url,
      apiKey: _credentials.api_key,
      endpointModelName: _credentials.endpoint_model_name
    })
    try {
      await reranker.rerank([], 'test', { model })
    } catch (error) {
      throw new Error(`Reranker credentials validation failed: ${getErrorMessage(error)}`)
    }
  }

  override async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
    const credentials = options?.modelProperties ?? ({} as TModelProperties)
    return new OpenAICompatibleReranker({
      endpointUrl: credentials.endpoint_url,
      apiKey: credentials.api_key,
      endpointModelName: credentials.endpoint_model_name
    })
  }
}
