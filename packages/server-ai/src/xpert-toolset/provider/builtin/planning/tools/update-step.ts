import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getContextVariable } from '@langchain/core/context'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { CONTEXT_VARIABLE_CURRENTSTATE } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PlanningToolEnum, TPlan, TStepStatus } from '../types'

export type TPlanUpdateStepToolParameters = {
	id: string
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
		id: z.string().describe(`Plan id`),
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
		config: LangGraphRunnableConfig & {toolCall}
	) {
		if (!parameters.id) {
			throw new ToolParameterValidationError(`id is empty`)
		}

		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const plans = (currentState['plans'] ?? {}) as Record<string, TPlan>
		const plan = plans[parameters.id]

		if (!plan) {
			throw new ToolParameterValidationError(`No plan found for id '${parameters.id}'`)
		}

		if (parameters.step_index == null) {
			throw new ToolParameterValidationError(`Parameter 'step_index' is required`)
		}

		if (parameters.step_index < 0 || parameters.step_index >= plan.steps.length) {
			throw new ToolParameterValidationError(
				`Invalid step_index: ${parameters.step_index}. Valid indices range from 0 to ${plan.steps.length - 1}.`
			)
		}

		plan.steps[parameters.step_index].status = parameters.step_status
		plan.steps[parameters.step_index].notes = parameters.step_notes

		const toolCallId = config.toolCall?.id
		return new Command({
			update: {
				plans: {
					[parameters.id]: plan
				},
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
