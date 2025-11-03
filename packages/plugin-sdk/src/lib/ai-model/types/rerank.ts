import { Document } from '@langchain/core/documents'
import { ICopilotModel } from '@metad/contracts'
import { AIModel } from '../ai-model'
import { TChatModelOptions } from './model'

export type RerankResult = {
  index: number
  relevanceScore: number
  document?: Document<Record<string, any>>
}

export abstract class RerankModel extends AIModel {
  async validateCredentials(model: string, credentials: Record<string, any>) {
    //
  }

  abstract getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank>
}

export interface IRerank {
  rerank(
    docs: Document<Record<string, any>>[],
    query: string,
    options: {
      topN?: number
      scoreThreshold?: number
      model?: string
    }
  ): Promise<RerankResult[]>
}
