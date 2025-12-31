import { z } from 'zod/v3'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { StructuredTool, ToolParams, ToolRunnableConfig } from '@langchain/core/tools'
import { InferInteropZodOutput } from '@langchain/core/utils/types'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, getToolCallFromConfig } from '@metad/contracts'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { t } from 'i18next'
import { FreeAskInternetAPIWrapper, type FreeAskInternetSearchResponse, type FreeAskInternetFormattedResponse } from './utils'
import { FreeAskInternetToolset } from '../freeaskinternet'

/**
 * Options for the FreeAskInternetSearch tool
 */
export type FreeAskInternetSearchAPIRetrieverFields = ToolParams & {
	/**
	 * The base URL of the FreeAskInternet server
	 * @default "http://localhost:8000"
	 */
	apiBaseUrl?: string
	/**
	 * The maximum number of search results to return
	 * @default 5
	 */
	maxResults?: number
	/**
	 * Search engine to use: "sogou", "bing", "google", "all"
	 * @default "sogou"
	 */
	searchEngine?: string
	/**
	 * Response language
	 * @default "zh-CN"
	 */
	lang?: string
	/**
	 * SearXNG URL override
	 */
	searxngUrl?: string
	/**
	 * The name of the tool
	 * @default "freeaskinternet_search"
	 */
	name?: string
	/**
	 * The description of the tool
	 */
	description?: string
	/**
	 * An API wrapper that can be used to interact with the FreeAskInternet API
	 * Useful for testing
	 */
	apiWrapper?: FreeAskInternetAPIWrapper
}

const inputSchema = z.object({
	query: z.string().describe('Search query to look up'),
	searchEngine: z
		.enum(['sogou', 'bing', 'google', 'all'])
		.optional()
		.describe('Search engine to use: sogou, bing, google, or all'),
	topK: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe('Maximum number of search results to return (1-20)'),
	lang: z
		.string()
		.optional()
		.describe('Response language (e.g., zh-CN, en-US)'),
})

/**
 * A Tool for performing searches with the FreeAskInternet service
 * FreeAskInternet is a free, local, and private search aggregator that uses SearXNG
 * to search multiple engines and return results
 *
 * Example:
 * ```typescript
 * const tool = new FreeAskInternetSearch({
 *   maxResults: 5,
 *   apiBaseUrl: "http://localhost:8000"
 * });
 * const results = await tool.invoke({ query: "latest AI news" });
 * console.log(results);
 * ```
 */
export class FreeAskInternetSearch extends StructuredTool<typeof inputSchema> {
	static lc_name(): string {
		return 'FreeAskInternetSearch'
	}

	override description: string =
		'A free, local, and private search engine aggregator. Useful for when you need to answer questions about current events or general information. Input should be a search query.'

	override name: string = 'freeaskinternet_search'

	override schema = inputSchema

	apiBaseUrl?: string
	maxResults?: number
	searchEngine?: string
	lang?: string
	searxngUrl?: string
	handleToolError = true
	apiWrapper: FreeAskInternetAPIWrapper

	/**
	 * Constructs a new instance of the FreeAskInternetSearch tool
	 * @param params Optional configuration parameters for the tool
	 */
	constructor(params: FreeAskInternetSearchAPIRetrieverFields = {}) {
		super(params)

		if (params.name) {
			this.name = params.name
		}

		if (params.description) {
			this.description = params.description
		}

		if (params.apiWrapper) {
			this.apiWrapper = params.apiWrapper
		} else {
			this.apiWrapper = new FreeAskInternetAPIWrapper({
				apiBaseUrl: params.apiBaseUrl,
			})
		}

		this.maxResults = params.maxResults
		this.searchEngine = params.searchEngine
		this.lang = params.lang
		this.searxngUrl = params.searxngUrl
	}

	async _call(
		input: InferInteropZodOutput<typeof inputSchema>,
		_runManager?: CallbackManagerForToolRun,
		parentConfig?: ToolRunnableConfig
	): Promise<FreeAskInternetFormattedResponse | { error: string }> {
		try {
			const { query, searchEngine, topK, lang } = input

			// Use instance values as defaults, then override with input values
			const effectiveSearchEngine = searchEngine || this.searchEngine || 'sogou'
			const effectiveTopK = topK || this.maxResults || 5
			const effectiveLang = lang || this.lang || 'zh-CN'

			const rawResults = await this.apiWrapper.rawResults({
				query,
				search_engine: effectiveSearchEngine,
				top_k: effectiveTopK,
				lang: effectiveLang,
				searxng_url: this.searxngUrl,
			})

			if (!rawResults || !rawResults.success || !Array.isArray(rawResults.search_results)) {
				const errorMessage = rawResults?.error_msg || `No search results found for '${query}'`
				throw new Error(errorMessage)
			}

			// Convert FreeAskInternet format to Tavily-like format for consistency
			const formattedResults = {
				query: query,
				results: rawResults.search_results.map((item) => ({
					title: item.title,
					url: item.url,
					content: item.snippet,
					score: 1.0, // FreeAskInternet doesn't provide scores, use default
				})),
				response_time: (Date.now() / 1000) - rawResults.timestamp, // Convert to seconds
			}

			const toolCall = getToolCallFromConfig(parentConfig)
			// Tool message event
			dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.WebSearch,
				toolset: FreeAskInternetToolset.provider,
				tool: this.name,
				title: t('server-ai:Tools.FreeAskInternetSearch.WebSearch'),
				message: query,
				data: formattedResults.results,
			}).catch((err) => {
				console.error(err)
			})

			return formattedResults
		} catch (e: unknown) {
			const errorMessage = e && typeof e === 'object' && 'message' in e ? e.message : String(e)
			return { error: errorMessage as string }
		}
	}
}

