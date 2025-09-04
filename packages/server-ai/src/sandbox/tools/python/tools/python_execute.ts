import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getContextVariable } from '@langchain/core/context'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, CONTEXT_VARIABLE_CURRENTSTATE, mapTranslationLanguage, STATE_VARIABLE_SYS } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import * as _axios from 'axios'
import z from 'zod'
import { PythonToolset } from '../python'
import { PythonToolEnum } from '../types'
import { SandboxBaseTool } from '../../sandbox-tool'
import { ToolParameterValidationError } from '../../../../xpert-toolset'
import { SandboxLoadCommand } from '../../../commands'
const axios = _axios.default

export type TPythonExecuteToolParameters = {
	code: string
}

export class PythonExecuteTool extends SandboxBaseTool {
	readonly #logger = new Logger(PythonExecuteTool.name)

	static lc_name(): string {
		return PythonToolEnum.PYTHON_EXECUTE
	}
	name = PythonToolEnum.PYTHON_EXECUTE
	description =
		'Executes Python code string. Note: Only print outputs are visible, function return values are not captured. Use print statements to see results.'

	schema = z.object({
		code: z.string().describe(`The Python code to execute.`)
	})

	async _call(
		parameters: TPythonExecuteToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & { toolCall }
	) {
		if (!parameters.code) {
			throw new ToolParameterValidationError(`code is empty`)
		}

		const { signal, configurable } = config ?? {}
		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const lang = currentState[STATE_VARIABLE_SYS]?.language
	}
}
