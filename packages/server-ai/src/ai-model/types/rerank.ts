import { ICopilotModel } from '@metad/contracts'
import { Document } from '@langchain/core/documents'
import { AIModel } from '../ai-model'
import { TChatModelOptions } from './types'

export abstract class RerankModel extends AIModel {
	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		//
		return
	}

	abstract getDocumentCompressor(
		copilotModel: ICopilotModel,
		options?: TChatModelOptions
	): Promise<IRerank>
}

export interface IRerank {
    rerank(docs: Document<Record<string, any>>[], query: string, options: { topN: number }): Promise<{index: number; relevanceScore: number;}[]>
}