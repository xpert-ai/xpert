import { isToolEnabled, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { FreeAskInternetSearch } from './tools/freeaskinternet-search'
import { FreeAskInternetToolEnum } from './types'

export class FreeAskInternetToolset extends BuiltinToolset {
	static provider = 'freeaskinternet'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(FreeAskInternetToolset.provider, toolset, params)
	}

	async initTools() {
		this.tools ??= []
		const disableToolDefault = false

		// FreeAskInternet doesn't require API key, but we need the server URL
		// Check if api_base_url is provided, otherwise use default
		const apiBaseUrl = this.toolset?.credentials?.api_base_url as string || 'http://localhost:8000'

		this.toolset.tools
			.filter((_) => isToolEnabled(_, disableToolDefault))
			.forEach((tool) => {
				switch (tool.name) {
					case FreeAskInternetToolEnum.FreeAskInternetSearch: {
						const freeAskInternetSearchTool = new FreeAskInternetSearch({
							...omit(this.toolset.credentials, 'api_base_url'),
							apiBaseUrl: apiBaseUrl,
							maxResults: (this.toolset.credentials?.maxResults as number) || 5,
							searchEngine: (this.toolset.credentials?.search_engine as string) || 'sogou',
							lang: (this.toolset.credentials?.lang as string) || 'zh-CN',
							searxngUrl: this.toolset.credentials?.searxng_url as string,
						})
						// Overwrite tool name
						freeAskInternetSearchTool.name = tool.name
						this.tools.push(freeAskInternetSearchTool)
						break
					}
				}
			})

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			// Test connection to FreeAskInternet server
			const apiBaseUrl = (credentials.api_base_url as string) || 'http://localhost:8000'
			const freeAskInternetSearch = new FreeAskInternetSearch({
				apiBaseUrl: apiBaseUrl,
				maxResults: 1,
			})

			await freeAskInternetSearch.invoke({
				query: 'test',
			})
		} catch (e) {
			throw new ToolProviderCredentialValidationError(
				`Failed to connect to FreeAskInternet server: ${getErrorMessage(e)}`
			)
		}
	}
}

