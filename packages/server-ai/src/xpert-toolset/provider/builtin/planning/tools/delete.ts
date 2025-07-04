import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getContextVariable } from '@langchain/core/context'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, CONTEXT_VARIABLE_CURRENTSTATE } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PLAN_STEPS_NAME, PlanningToolEnum, TPlanStep } from '../types'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'

export type TPlanningDeleteStepToolParameters = {
	index: number
}

export class PlanningDeleteStepTool extends BuiltinTool {
	readonly #logger = new Logger(PlanningDeleteStepTool.name)

	static lc_name(): string {
		return PlanningToolEnum.DELETE_PLAN_STEP
	}
	name = PlanningToolEnum.DELETE_PLAN_STEP
	description = 'A tool for deleting a step in plan'

	schema = z.object({
		index: z.string().describe(`Step index in plan`)
	})

	constructor(private toolset: PlanningToolset) {
		super()

		this.verboseParsingErrors = true
	}

	async _call(
		parameters: TPlanningDeleteStepToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & { toolCall }
	) {
		if (parameters.index == null) {
			throw new ToolParameterValidationError(`Index of step is empty`)
		}

		const { subscriber } = config?.configurable ?? {}
		const toolCallId = config.toolCall?.id
		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const planSteps = currentState[PLAN_STEPS_NAME] as TPlanStep[]

		if (!planSteps) {
			throw new ToolParameterValidationError(`Steps of plan is null`)
		}

		const _delSteps = planSteps.splice(parameters.index, 1)

		// Tool message event
		dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: toolCallId,
			category: 'Computer',
			toolset: PlanningToolset.provider,
			tool: this.name,
			title: `❌ ${_delSteps[0]?.content}`,
			message: `Deleted ${parameters.index} step: ${_delSteps[0]?.content}`
		}).catch((err) => {
			this.#logger.error(err)
		})

		// Populated when a tool is called with a tool call from a model as input
		return new Command({
			update: {
				[PLAN_STEPS_NAME]: planSteps.map((_, index) => ({..._, index,})),
				// update the message history
				messages: [
					{
						role: 'tool',
						content: `Step deleted!`,
						tool_call_id: toolCallId
					}
				]
			}
		})
	}
}
