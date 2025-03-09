import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PlanningToolEnum, TPlan } from '../types'
import { getContextVariable } from '@langchain/core/context'
import { CONTEXT_VARIABLE_CURRENTSTATE } from '@metad/contracts'

export type TPlanningDeleteToolParameters = {
	id: string
}

export class PlanningDeleteTool extends BuiltinTool {
	readonly #logger = new Logger(PlanningDeleteTool.name)

	static lc_name(): string {
		return PlanningToolEnum.DELETE_PLAN
	}
	name = PlanningToolEnum.DELETE_PLAN
	description = 'A tool for deleting a plan'

	schema = z.object({
		id: z.string().describe(`Plan id`),
	})

	constructor(private toolset: PlanningToolset) {
		super()

        this.verboseParsingErrors = true
	}

	async _call(
		parameters: TPlanningDeleteToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & {toolCall}
	) {
		if (!parameters.id) {
			throw new ToolParameterValidationError(`id is empty`)
		}

		const { subscriber } = config?.configurable ?? {}

		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const plans = (currentState['plans'] ?? {}) as Record<string, TPlan>

		plans[parameters.id] = null

        // Populated when a tool is called with a tool call from a model as input
		const toolCallId = config.toolCall?.id
        return new Command({
            update: {
                plans,
                // update the message history
                messages: [
                    {
                        role: 'tool',
                        content: `Plan deleted!`,
                        tool_call_id: toolCallId
                    }
                ]
            }
        })
	}
}
