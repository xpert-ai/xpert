import { Document } from '@langchain/core/documents'
import { Callbacks } from '@langchain/core/callbacks/manager'
import { DocumentInterface } from '@langchain/core/documents'
import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IRerank } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { TChatModelOptions } from '../../../types/types'
import { TongyiCredentials } from '../types'
import { RerankModel } from '../../../types/rerank'
import { ModelProvider } from '../../../ai-provider'

@Injectable()
export class TongyiRerankModel extends RerankModel {
	constructor(modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.RERANK)
	}

	async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
		const credentials = copilotModel.copilot.modelProvider.credentials as TongyiCredentials
		return new TongyiRerank({
			apiKey: credentials.dashscope_api_key,
			model: copilotModel.model
		})
	}
}

export class TongyiRerank extends BaseDocumentCompressor implements IRerank {
	private readonly model: string = 'gte-rerank-v2'
	private readonly topN: number = 3
	private readonly apiKey: string = process.env.DASHSCOPE_API_KEY || ''
	private url = 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank'

	constructor(fields: { apiKey: string; model: string; topN?: number }) {
		super()

		this.apiKey = fields.apiKey || this.apiKey
		this.model = fields.model || this.model
		this.topN = fields.topN || this.topN
	}

	async compressDocuments(
		documents: DocumentInterface[],
		query: string,
		callbacks?: Callbacks
	): Promise<DocumentInterface[]> {
		const topN = this.topN
		const rerankResults = await this.rerank(documents as Document<Record<string, any>>[], query, { topN })

		const sortedIndices = rerankResults.slice(0, topN).map((result) => result.index)

		return sortedIndices.map((idx) => documents[idx])
	}

	async rerank(
		docs: Document<Record<string, any>>[],
		query: string,
		options: {
			topN?: number
			scoreThreshold?: number
			model?: string
		}
	): Promise<
    {
      index: number
      relevanceScore: number
      document?: Document<Record<string, any>>
    }[]
  > {
		const apiKey = this.apiKey
		const url = this.url

		const documents = docs.map((doc) => doc.pageContent)
		const payload = {
			model: this.model,
			input: {
				query,
				documents
			},
			parameters: {
				return_documents: false,
				top_n: options.topN
			}
		}

		const response = await axios.post(url, payload, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		})

		const results = response.data.output?.results || []
		return results.map((item: any) => ({
			index: item.index,
			relevanceScore: item.relevance_score
		}))
	}
}
