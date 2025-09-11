import { IIntegration, KnowledgeProviderEnum } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import axios, { AxiosResponse } from 'axios'
import { Document } from 'langchain/document'
import { KnowledgeStrategy, KnowledgeStrategyKey, TKnowledgeStrategyParams } from '@xpert-ai/plugin-sdk'
import { RAGFlow } from './types'

// Request interfaces
interface RetrievalRequest {
	question: string
	dataset_ids: string[]
	document_ids?: string[]
	page?: number
	page_size?: number
	similarity_threshold?: number
	vector_similarity_weight?: number
	top_k?: number
	rerank_id?: string
	keyword?: boolean
	highlight?: boolean
	cross_languages?: string[]
}

// Response interfaces
interface Chunk {
	content: string
	content_ltks: string
	document_id: string
	document_keyword: string
	highlight: string
	id: string
	image_id: string
	important_keywords: string[]
	kb_id: string
	positions: string[]
	similarity: number
	term_similarity: number
	vector_similarity: number
}

interface DocAgg {
	count: number
	doc_id: string
	doc_name: string
}

interface RetrievalResponse {
	code: number
	data?: {
		chunks: Chunk[]
		doc_aggs: DocAgg[]
		total: number
	}
	message?: string
}

@Injectable()
@KnowledgeStrategyKey(RAGFlow)
export class RAGFlowKnowledgeStrategy implements KnowledgeStrategy {
	async execute(integration: IIntegration, payload: TKnowledgeStrategyParams): Promise<{ chunks: [Document, number][] }> {
		let baseUrl: string = integration.options.url
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		if (baseUrl.endsWith('/v1')) {
			baseUrl = baseUrl.slice(0, -3)
		}
		if (baseUrl.endsWith('/api')) {
			baseUrl = baseUrl.slice(0, -4)
		}

		const url = baseUrl + `/api/v1/retrieval`

		const request: RetrievalRequest = {
			question: payload.query,
			dataset_ids: [payload.options.knowledgebaseId],
			top_k: payload.k,

		}

		try {
			const result = await retrieveChunks(url, integration.options.apiKey, request)
			return {
				chunks: result.data.chunks.map((item) => {
					return [new Document({
						pageContent: item.content,
						id: item.id,
						metadata: omit(item, 'content', 'id')
					}), item.vector_similarity]
				})
			}
		} catch (error: any) {
			throw new InternalServerErrorException(`RAGFlow Knowledge Strategy Error: ${error.message}`)
		}
	}
}

async function retrieveChunks(url: string, apiKey: string, request: RetrievalRequest): Promise<RetrievalResponse> {
	try {
		const response: AxiosResponse<RetrievalResponse> = await axios.post(url, request, {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			}
		})

		if (response.data.code !== 0) {
			throw new Error(response.data.message)
		}

		return response.data
	} catch (error: any) {
		throw new Error(`Failed to retrieve chunks: ${error.message}`)
	}
}
