import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset } from '../builtin-toolset'
import { TavilySearchResults } from './tools/tavily_search'

export class TavilyToolset extends BuiltinToolset {
	static provider = 'tavily'

	constructor(protected toolset?: IXpertToolset) {
		super(TavilyToolset.provider, toolset)

		if (toolset) {
            const tool = toolset.tools?.[0]
            if (tool?.enabled) {
				if (!toolset.credentials?.tavily_api_key) {
					throw new ToolProviderCredentialValidationError(`Credential 'tavily_api_key' not provided`)
				}
                const tavilySearchTool = new TavilySearchResults({
                    ...(tool.parameters ?? {}),
                    apiKey: toolset.credentials.tavily_api_key as string,
					kwargs: omit(tool.parameters, 'max_results')
                })
				// Overwrite tool name
				tavilySearchTool.name = tool.name
                this.tools = [
                    tavilySearchTool
                ]
            }
		}
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const tavilySearch = new TavilySearchResults({
				apiKey: credentials.tavily_api_key as string,
                max_results: 1
			})

			await tavilySearch.invoke({
				input: 'Sachin Tendulkar',
			})
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
