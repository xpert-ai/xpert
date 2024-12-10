import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { SerpAPI } from "@langchain/community/tools/serpapi"
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinToolset } from '../builtin-toolset'

export class SerpAPIToolset extends BuiltinToolset {
	static provider = 'serpapi'

	constructor(protected toolset?: IXpertToolset) {
		super(SerpAPIToolset.provider, toolset)

		if (toolset) {
            const tool = toolset.tools?.[0]
            if (tool?.enabled) {
				if (!toolset.credentials?.api_key) {
					throw new ToolProviderCredentialValidationError(`Credential 'api_key' not provided`)
				}

				const serpAPITool = new SerpAPI(toolset.credentials.api_key)
                
				// Overwrite tool name
				serpAPITool.name = tool.name
                this.tools = [
                    serpAPITool
                ]
            }
		}
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const serpAPITool = new SerpAPI(credentials?.api_key)

			await serpAPITool.invoke({
				input: 'what is the current weather in SF?',
			})
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
