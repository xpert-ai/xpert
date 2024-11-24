import { IXpertTool, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ChatBICommandTool } from './tools/chatbi-command'
import { BuiltinToolset, TBuiltinToolsetParams, ToolProviderCredentialValidationError } from '@metad/server-ai'

export class ChatBIToolset extends BuiltinToolset {
	static provider = 'chatbi'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams,
	) {
		super(ChatBIToolset.provider, toolset, params)

		if (toolset) {
			this.tools = toolset.tools
				.filter((tool) => tool.enabled)
				.map((tool) => {
					// Provide specific tool name to tool class
					const DynamicCommandTool = class extends ChatBICommandTool {
						static lc_name(): string {
							return tool.name
						}
						constructor(tool: IXpertTool, toolset: BuiltinToolset) {
							super(tool, toolset)
						}
					}

					return new DynamicCommandTool({...tool, toolset: omit(toolset, 'tools')}, this)
				})
		}
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const models = credentials.models
			// await this.params.toolsetService.executeCommand('PingDataSource', {
			// 	dataSource: dataSources[0],
			// 	schema: schema?.[0]
			// })
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
