import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { RunnableConfig } from '@langchain/core/runnables'
import { ICopilot, TCopilotModel } from '@metad/contracts'
import { AIModelGetOneQuery } from '../../../../../ai-model'
import { CopilotGetOneQuery } from '../../../../../copilot/'
import { ToolProviderCredentialValidationError } from '../../../../errors'
import { BaseCommandTool } from '../../command'
import { randomUUID } from 'crypto'

/**
 * Command tool for ChatBI
 */
export class ChatBICommandTool extends BaseCommandTool {
	protected async _call(
		arg: any,
		runManager?: CallbackManagerForToolRun,
		parentConfig?: RunnableConfig
	): Promise<string> {
		// Assemble Tool parameters
		const args = {
			...this.tool.parameters, // Form parameters on setup
			...arg // LLM parameters in runtime,
		}

		const copilotModel = this.tool.toolset.credentials.copilotModel as TCopilotModel
		if (!copilotModel?.copilotId) {
			throw new ToolProviderCredentialValidationError(``)
		}
		const copilot = await this.queryBus.execute<CopilotGetOneQuery, ICopilot>(
			new CopilotGetOneQuery(copilotModel.copilotId)
		)
		const abortController = new AbortController()
		const chatModel = await this.queryBus.execute<AIModelGetOneQuery, BaseChatModel>(
			new AIModelGetOneQuery(copilot, copilotModel, {
				abortController,
				tokenCallback: (token) => {
					// execution.tokens += (token ?? 0)
				}
			})
		)

		parentConfig.signal?.addEventListener('abort', () => {
			abortController.abort()
		})

		return await super._call(args, runManager, {
			...parentConfig,
			signal: abortController.signal,
			configurable: {
				...(parentConfig.configurable ?? {}),
				// ChatbiModels in credentials configuration
				models: this.tool.toolset.credentials.models,
				chatModel,
				thread_id: (runManager?.parentRunId ?? randomUUID()) + '/chatbi-tool',
			}
		})
	}
}