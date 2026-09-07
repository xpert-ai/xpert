import { Document } from '@langchain/core/documents'
import { ICopilotModel } from '@xpert-ai/contracts'
import { AIModel } from '../ai-model'
import { TChatModelOptions } from './model'

export type RerankResult = {
  index: number
  /** Relevance score reported by the rerank provider. Higher values are more relevant. */
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
      /** Minimum relevanceScore, applied before the Top N limit. */
      scoreThreshold?: number
      model?: string
    }
  ): Promise<RerankResult[]>
}
