import { isToolEnabled, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinToolset, TBuiltinToolsetParams, ToolProviderCredentialValidationError } from '@metad/server-ai'
import { getErrorMessage } from '@metad/server-common'
import { DataSourcePingCommand } from '../../../../data-source/commands/'
import { buildExecuteSQLTool } from './tools/db_execute_sql'
import { buildListTablesTool } from './tools/db_list_tables'
import { buildQuerySchemaTool } from './tools/db_query_schema'
import { ChatDBToolEnum } from './types'

export class ChatDBToolset extends BuiltinToolset {
	static provider = 'chatdb'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(ChatDBToolset.provider, toolset, params)
	}

	async initTools() {
		this.tools = []
		if (this.toolset) {
			const disableToolDefault = this.toolset?.options?.disableToolDefault
			const enableAll = !this.toolset.tools?.length
			this.toolset.tools.forEach((tool) => {
				if (isToolEnabled(tool, disableToolDefault) || enableAll) {
					switch (tool.name) {
						case ChatDBToolEnum.ListTables:
							this.tools.push(buildListTablesTool(this))
							break
						case ChatDBToolEnum.QuerySchema:
							this.tools.push(buildQuerySchemaTool(this))
							break
						case ChatDBToolEnum.ExecuteSQL:
							this.tools.push(buildExecuteSQLTool(this))
							break
						default:
							this.logger.warn(`Unsupported tool: ${tool.name}`)
					}
				}
			})
		}
		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		try {
			const dataSource = credentials.dataSource
			const schema = credentials.schema
			await this.commandBus.execute(
				new DataSourcePingCommand({
					dataSource: dataSource,
					schema: schema
				})
			)
		} catch (e) {
			throw new ToolProviderCredentialValidationError(getErrorMessage(e))
		}
	}
}
