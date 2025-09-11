import { IIntegration, KnowledgeProviderEnum } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import axios, { AxiosResponse } from 'axios'
import { Document } from 'langchain/document'
import { KnowledgeStrategy, KnowledgeStrategyKey, TKnowledgeStrategyParams } from '@xpert-ai/plugin-sdk'

@Injectable()
@KnowledgeStrategyKey(KnowledgeProviderEnum.Dify)
export class DifyKnowledgeStrategy implements KnowledgeStrategy {
	async execute(
		integration: IIntegration,
		payload: TKnowledgeStrategyParams
	): Promise<{ chunks: [Document, number][] }> {
		let baseUrl: string = integration.options.url
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		if (baseUrl.endsWith('/v1')) {
			baseUrl = baseUrl.slice(0, -3)
		}

		const url = baseUrl +`/v1/datasets/${payload.options.knowledgebaseId}/retrieve`

		const request: DifyRetrievalRequest = {
			query: payload.query,
			retrieval_model: {
				search_method: 'semantic_search',
				top_k: payload.k,
				score_threshold_enabled: false,
				reranking_enable: false
			}
		}

		try {
			const result = await difyRetrieve(url, integration.options.apiKey, request)
			return {
				chunks: result.records.map((item) => {
					return [
						new Document({
							pageContent: item.segment.content,
							id: item.segment.id,
							metadata: omit(item.segment, 'content', 'id')
						}),
						item.score
					]
				})
			}
		} catch (error) {
			throw new InternalServerErrorException(`Dify Knowledge Strategy Error: ${error.message}`)
		}
	}
}

// Request interfaces
interface MetadataCondition {
	name: string
	comparison_operator: string
	value: string
}

interface MetadataFilteringConditions {
	logical_operator: string
	conditions: MetadataCondition[]
}

interface RetrievalModel {
	search_method: 'keyword_search' | 'semantic_search' | 'full_text_search' | 'hybrid_search'
	reranking_enable: boolean
	reranking_mode: string | null
	reranking_model: {
		reranking_provider_name: string
		reranking_model_name: string
	}
	weights: null | any
	top_k: number
	score_threshold_enabled: boolean
	score_threshold: number | null
	metadata_filtering_conditions: MetadataFilteringConditions
}

interface DifyRetrievalRequest {
	query: string
	retrieval_model?: Partial<RetrievalModel>
}

// Response interfaces
interface IDocument {
	id: string
	data_source_type: string
	name: string
}

interface Segment {
	id: string
	position: number
	document_id: string
	content: string
	answer: string | null
	word_count: number
	tokens: number
	keywords: string[]
	index_node_id: string
	index_node_hash: string
	hit_count: number
	enabled: boolean
	disabled_at: string | null
	disabled_by: string | null
	status: string
	created_by: string
	created_at: number
	indexing_at: number
	completed_at: number
	error: string | null
	stopped_at: string | null
	document: IDocument
}

interface Record {
	segment: Segment
	score: number
	tsne_position: any | null
}

interface Query {
	content: string
}

interface DifyRetrievalResponse {
	query: Query
	records: Record[]
}

async function difyRetrieve(
	url: string,
	apiKey: string,
	request: DifyRetrievalRequest
): Promise<DifyRetrievalResponse> {
	try {
		const response: AxiosResponse<DifyRetrievalResponse> = await axios.post(url, request, {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			}
		})

		return response.data
	} catch (error) {
		throw new Error(`Failed to retrieve from Dify: ${getErrorMessage(error)}`)
	}
}
