import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset } from '../builtin-toolset'
import { SearchApi } from './tools/searchapi'

export class SearchAPIToolset extends BuiltinToolset {
	static provider = 'searchapi'

	constructor(protected toolset?: IXpertToolset) {
		super(SearchAPIToolset.provider, toolset)

		if (toolset) {
			const tool = toolset.tools?.[0]
			if (tool?.enabled) {
				if (!toolset.credentials?.searchapi_api_key) {
					throw new ToolProviderCredentialValidationError(`Credential 'searchapi_api_key' not provided`)
				}

				const searchApi = new SearchApi(toolset.credentials.searchapi_api_key, omit(toolset.credentials, 'searchapi_api_key'))

				// Overwrite tool name
				searchApi.name = tool.name
				this.tools = [searchApi]
			}
		}
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const searchApi = new SearchApi(credentials?.searchapi_api_key)

			await searchApi.invoke({
				query: `What's happening in Ukraine today?`
			})
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
