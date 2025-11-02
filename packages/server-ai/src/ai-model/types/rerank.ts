import { ICopilotModel } from '@metad/contracts'
import { IRerank } from '@xpert-ai/plugin-sdk'
import { AIModel } from '../ai-model'
import { TChatModelOptions } from './types'

export abstract class RerankModel extends AIModel {
	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		//
		return
	}

	abstract getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank>
}

// export interface IRerank {
// 	rerank(
// 		docs: Document<Record<string, any>>[],
// 		query: string,
// 		options: { topN: number }
// 	): Promise<{ index: number; relevanceScore: number }[]>
// }
