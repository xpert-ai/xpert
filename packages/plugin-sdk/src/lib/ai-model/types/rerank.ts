import { ICopilotModel } from '@metad/contracts'
import { Document } from '@langchain/core/documents'
import { TChatModelOptions } from './model';
import { AIModel } from '../ai-model';

export abstract class RerankModel extends AIModel {
	async validateCredentials(model: string, credentials: Record<string, any>) {
		//
	}

	abstract getDocumentCompressor(
		copilotModel: ICopilotModel,
		options?: TChatModelOptions
	): Promise<IRerank>
}

export interface IRerank {
    rerank(docs: Document<Record<string, any>>[], query: string, options: { topN: number }): Promise<{index: number; relevanceScore: number;}[]>
}