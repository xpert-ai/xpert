import { isEnableTool, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { TavilySearchResults } from './tools/tavily_search'

export class TavilyToolset extends BuiltinToolset {
	static provider = 'tavily'

	constructor(protected toolset?: IXpertToolset, params?: TBuiltinToolsetParams) {
		super(TavilyToolset.provider, toolset, params)
	}

	async initTools() {
		this.tools ??= []
		const toolset = this.toolset
		const tool = toolset?.tools?.[0]
		if (toolset && isEnableTool(tool, toolset)) {
			if (!toolset.credentials?.tavily_api_key) {
				throw new ToolProviderCredentialValidationError(`Credential 'tavily_api_key' not provided`)
			}
			const tavilySearchTool = new TavilySearchResults(this, {
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

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const tavilySearch = new TavilySearchResults(this, {
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
