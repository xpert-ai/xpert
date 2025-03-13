import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getContextVariable } from '@langchain/core/context'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, CONTEXT_VARIABLE_CURRENTSTATE } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PLAN_STEPS_NAME, PlanningToolEnum, TStepStatus } from '../types'

export type TPlanUpdateStepToolParameters = {
	// id: string
	step_index: number
	step_status: TStepStatus
	step_notes: string
}

export class PlanningUpdateStepTool extends BuiltinTool {
	readonly #logger = new Logger(PlanningUpdateStepTool.name)

	static lc_name(): string {
		return PlanningToolEnum.UPDATE_PLAN_STEP
	}
	name = PlanningToolEnum.UPDATE_PLAN_STEP
	description = 'A tool for updating a plan step'

	schema = z.object({
		step_index: z.number().describe(`Index of step in the plan`),
		step_status: z.enum(['in_progress', 'completed', 'blocked']),
		step_notes: z.string().optional().describe('Additional notes for a step. Optional for mark_step command.')
	})

	constructor(private toolset: PlanningToolset) {
		super()

		this.verboseParsingErrors = true
	}

	async _call(
		parameters: TPlanUpdateStepToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & { toolCall }
	) {
		if (parameters.step_index == null) {
			throw new ToolParameterValidationError(`step index is empty`)
		}

		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const planSteps = currentState[PLAN_STEPS_NAME]

		if (!planSteps) {
			throw new ToolParameterValidationError(`No plan steps`)
		}

		if (parameters.step_index < 0 || parameters.step_index >= planSteps.length) {
			throw new ToolParameterValidationError(
				`Invalid step_index: ${parameters.step_index}. Valid indices range from 0 to ${planSteps.length - 1}.`
			)
		}

		// Tool message event
		dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			toolset: PlanningToolset.provider,
			tool: this.name,
			message: `Update ${parameters.step_index} step: ${parameters.step_status}, ${parameters.step_notes}`
		}).catch((err) => {
			this.#logger.error(err)
		})

		planSteps[parameters.step_index].status = parameters.step_status
		planSteps[parameters.step_index].notes = parameters.step_notes

		const toolCallId = config.toolCall?.id
		return new Command({
			update: {
				[PLAN_STEPS_NAME]: planSteps,
				// update the message history
				messages: [
					{
						role: 'tool',
						content: `Plan step updated!`,
						tool_call_id: toolCallId
					}
				]
			}
		})
	}
}
