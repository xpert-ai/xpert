import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { BashToolset } from '../bash'
import { BashToolEnum } from '../types'
import { SandboxBaseTool } from '../../sandbox-tool'
import { ToolParameterValidationError } from '../../../../xpert-toolset'

export type TBashExecToolParameters = {
	command: string
}

export class BashExecTool extends SandboxBaseTool {
	readonly #logger = new Logger(BashExecTool.name)

	static lc_name(): string {
		return BashToolEnum.BASH_EXECUTE
	}
	name = BashToolEnum.BASH_EXECUTE
	description = 'A tool can execute command in bash'

	schema = z.object({
		command: z.string().describe(`Command`)
	})

	constructor(protected toolset: BashToolset) {
		super(toolset)
	}

	async _call(
		parameters: TBashExecToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & { toolCall }
	) {
		if (!parameters.command) {
			throw new ToolParameterValidationError(`command is empty`)
		}

		const { signal, configurable } = config ?? {}

		return '' // JSON.stringify(result.data)
	}
}
