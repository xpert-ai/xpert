import { IXpertTool, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ChatDBCommandTool } from './tools/chatdb-command'
import { BuiltinToolset, TBuiltinToolsetParams, ToolProviderCredentialValidationError } from '@metad/server-ai'

export class ChatDBToolset extends BuiltinToolset {
	static provider = 'chatdb'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams,
	) {
		super(ChatDBToolset.provider, toolset, params)

		if (toolset) {
			this.tools = toolset.tools.filter((_) => !(_.disabled ?? !_.enabled))
				.map((tool) => {
					// Provide specific tool name to tool class
					const DynamicCommandTool = class extends ChatDBCommandTool {
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
			const dataSource = credentials.dataSource
			const schema = credentials.schema
			await this.params.toolsetService.executeCommand('PingDataSource', {
				dataSource: dataSource,
				schema: schema
			})
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
