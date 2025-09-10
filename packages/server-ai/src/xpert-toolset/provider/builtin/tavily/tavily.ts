import { isToolEnabled, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { TavilyCrawl } from './tools/tavily-crawl'
import { TavilyExtract } from './tools/tavily-extract'
import { TavilySearch } from './tools/tavily-search'
import { TavilyToolEnum } from './types'

export class TavilyToolset extends BuiltinToolset {
	static provider = 'tavily'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(TavilyToolset.provider, toolset, params)
	}

	async initTools() {
		this.tools ??= []
		const disableToolDefault = false
		if (!this.toolset.credentials?.tavily_api_key) {
			throw new ToolProviderCredentialValidationError(`Credential 'tavily_api_key' not provided`)
		}
		this.toolset.tools
			.filter((_) => isToolEnabled(_, disableToolDefault))
			.forEach((tool) => {
				switch (tool.name) {
					case TavilyToolEnum.TavilySearch: {
						const tavilySearchTool = new TavilySearch({
							...omit(this.toolset.credentials, 'tavily_api_key'),
							tavilyApiKey: this.toolset.credentials.tavily_api_key as string
						})
						// Overwrite tool name
						tavilySearchTool.name = tool.name
						this.tools.push(tavilySearchTool)
						break
					}
					case TavilyToolEnum.TavilyExtract: {
						const tavilyTool = new TavilyExtract({
							...omit(this.toolset.credentials, 'tavily_api_key'),
							tavilyApiKey: this.toolset.credentials.tavily_api_key as string
						})
						// Overwrite tool name
						tavilyTool.name = tool.name
						this.tools.push(tavilyTool)
						break
					}
					case TavilyToolEnum.TavilyCrawl: {
						const tavilyTool = new TavilyCrawl({
							...omit(this.toolset.credentials, 'tavily_api_key'),
							tavilyApiKey: this.toolset.credentials.tavily_api_key as string
						})
						// Overwrite tool name
						tavilyTool.name = tool.name
						this.tools.push(tavilyTool)
						break
					}
				}
			})

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const tavilySearch = new TavilySearch({
				tavilyApiKey: credentials.tavily_api_key as string,
				maxResults: 1
			})

			await tavilySearch.invoke({
				query: 'XpertAI'
			})
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
