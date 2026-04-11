import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search'
import { IXpertToolset, TToolCredentials } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset } from '../builtin-toolset'

export class DuckDuckGoToolset extends BuiltinToolset {
	static provider = 'duckduckgo'

	constructor(protected toolset?: IXpertToolset) {
		super(DuckDuckGoToolset.provider, toolset)
	}

	async _validateCredentials(credentials: TToolCredentials): Promise<void> {
		const tool = new DuckDuckGoSearch({ maxResults: 1 })
		try {
			await tool.invoke('what is the current weather in sf?')
		} catch (error) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(error))
		}
	}
}
