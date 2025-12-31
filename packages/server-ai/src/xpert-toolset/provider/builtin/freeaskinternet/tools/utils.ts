/**
 * API wrapper for FreeAskInternet search service
 * This utility class handles communication with the FreeAskInternet Python server
 */

export type FreeAskInternetSearchParams = {
	/**
	 * The search query string
	 */
	query: string
	/**
	 * Search engine to use: "sogou", "bing", "google", "all"
	 * @default "sogou"
	 */
	search_engine?: string
	/**
	 * Maximum number of results to return
	 * @default 5
	 */
	top_k?: number
	/**
	 * Response language
	 * @default "zh-CN"
	 */
	lang?: string
	/**
	 * SearXNG URL override (if provided, will be used instead of default)
	 */
	searxng_url?: string
}

export type FreeAskInternetSearchItem = {
	url: string
	icon_url: string
	site_name: string
	snippet: string
	title: string
}

export type FreeAskInternetSearchResponse = {
	request_id: string
	timestamp: number
	success: boolean
	search_results: FreeAskInternetSearchItem[]
	content_list?: Array<{
		url: string
		content: string
		length: number
	}>
	summarized_answer?: string
	error_msg?: string
}

/**
 * Formatted search result item (Tavily-like format)
 */
export type FreeAskInternetSearchResult = {
	title: string
	url: string
	content: string
	score: number
}

/**
 * Formatted search response (Tavily-like format for tool return)
 */
export type FreeAskInternetFormattedResponse = {
	query: string
	results: FreeAskInternetSearchResult[]
	response_time: number
}

/**
 * API wrapper class for FreeAskInternet search service
 */
export class FreeAskInternetAPIWrapper {
	private apiBaseUrl: string

	/**
	 * Constructs a new instance of FreeAskInternetAPIWrapper
	 * @param fields Configuration fields including apiBaseUrl
	 */
	constructor(fields: { apiBaseUrl?: string }) {
		// Default to localhost:8000 if not provided
		this.apiBaseUrl = fields.apiBaseUrl || 'http://localhost:8000'
		// Ensure URL doesn't end with /
		this.apiBaseUrl = this.apiBaseUrl.replace(/\/$/, '')
	}

	/**
	 * Performs a search using the FreeAskInternet API
	 * @param params The search parameters
	 * @returns The raw response from the FreeAskInternet API
	 */
	async rawResults(params: FreeAskInternetSearchParams): Promise<FreeAskInternetSearchResponse> {
		const headers = {
			'Content-Type': 'application/json',
		}

		const requestBody = {
			user_query: params.query,
			search_engine: params.search_engine || 'sogou',
			top_k: params.top_k || 5,
			lang: params.lang || 'zh-CN',
			searxng_url: params.searxng_url,
			need_summarize: false, // We don't need summarization for tool usage
		}

		const response = await fetch(`${this.apiBaseUrl}/api/v1/tool/search`, {
			method: 'POST',
			headers,
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
			const errorMessage = errorData.error_msg || errorData.error || `HTTP ${response.status}`
			throw new Error(`FreeAskInternet API error: ${errorMessage}`)
		}

		return response.json()
	}
}

