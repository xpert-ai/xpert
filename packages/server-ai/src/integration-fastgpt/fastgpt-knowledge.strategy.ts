import { IIntegration, KnowledgeProviderEnum } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import axios, { AxiosResponse } from 'axios'
import { Document } from 'langchain/document'
import { KnowledgeStrategy, KnowledgeStrategyKey, TKnowledgeStrategyParams } from '@xpert-ai/plugin-sdk'

@Injectable()
@KnowledgeStrategyKey(KnowledgeProviderEnum.FastGPT)
export class FastGPTKnowledgeStrategy implements KnowledgeStrategy {
	async execute(
		integration: IIntegration,
		payload: TKnowledgeStrategyParams
	): Promise<{ chunks: [Document, number][] }> {
		let baseUrl: string = integration.options.url
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		if (baseUrl.endsWith('/api')) {
			baseUrl = baseUrl.slice(0, -4)
		}

		const request: FastGPTSearchRequest = {
			datasetId: payload.options.knowledgebaseId,
			text: payload.query,
			limit: payload.k,
			similarity: 0,
			searchMode: 'embedding',
			usingReRank: false
		}

		try {
			const result = await fastGPTSearch(
				`${baseUrl}/api/core/dataset/searchTest`,
				integration.options.apiKey,
				request
			)

			return {
				chunks: result.data.list.map((item) => {
					return [
						new Document({
							pageContent: item.q,
							id: item.id,
							metadata: omit(item, 'q', 'id', 'score')
						}),
						item.score.find((_) => _.type === 'embedding')?.value || 0
					]
				})
			}
		} catch (error) {
			throw new InternalServerErrorException(`FastGPT Knowledge Strategy Error: ${error.message}`)
		}
	}
}

// Request interfaces
interface FastGPTSearchRequest {
	datasetId: string
	text: string
	limit: number
	similarity?: number
	searchMode: 'embedding' | 'fullTextRecall' | 'mixedRecall'
	usingReRank: boolean
	datasetSearchUsingExtensionQuery?: boolean
	datasetSearchExtensionModel?: string
	datasetSearchExtensionBg?: string
}



// Response interfaces
interface SearchResult {
	id: string
	q: string
	a: string
	datasetId: string
	collectionId: string
	sourceName: string
	sourceId: string
	score: { type: string; value: number }[]
}

interface FastGPTSearchResponse {
	code: number
	statusText: string
	data: {
		list: SearchResult[]
		duration: string
		usingReRank: boolean
		searchMode: 'embedding' | 'fullTextRecall' | 'mixedRecall'
		limit: number
		similarity: number
		usingSimilarityFilter: boolean
	}
}

async function fastGPTSearch(
	url: string,
	apiKey: string,
	request: FastGPTSearchRequest
): Promise<FastGPTSearchResponse> {
	try {
		const response: AxiosResponse<FastGPTSearchResponse> = await axios.post(url, request, {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			}
		})

		return response.data
	} catch (error) {
		throw new Error(`Failed to search FastGPT: ${error.message}`)
	}
}
