import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { RunnableConfig } from '@langchain/core/runnables'
import { BaseCommandTool } from '@metad/server-ai'

/**
 * Command operators on database
 */
export class ChatDBCommandTool extends BaseCommandTool {
	protected async _call(
		arg: any,
		runManager?: CallbackManagerForToolRun,
		parentConfig?: RunnableConfig
	): Promise<string> {
		// Assemble Tool parameters
		const args = {
			...this.tool.parameters, // Form parameters on setup
			...arg, // LLM parameters in runtime,
			dataSource: this.tool.toolset.credentials.dataSource, // DataSource in credentials configuration
			schema: this.tool.toolset.credentials.schema
		}
		const result = await super._call(args, runManager, parentConfig)
		return JSON.stringify(result) 
	}
}
