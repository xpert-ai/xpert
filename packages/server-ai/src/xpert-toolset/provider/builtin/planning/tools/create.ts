import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PlanningToolEnum, TPlan } from '../types'

export type TPlanningCreateToolParameters = TPlan

export class PlanningCreateTool extends BuiltinTool {
	readonly #logger = new Logger(PlanningCreateTool.name)

	static lc_name(): string {
		return PlanningToolEnum.CREATE_PLAN
	}
	name = PlanningToolEnum.CREATE_PLAN
	description = 'A tool for creating a plan'

	schema = z.object({
		id: z.string().describe(`Plan id`),
		title: z.string().describe(`Plan title`),
		steps: z.array(z.string().optional().describe(`Step of plan`))
	})

	constructor(private toolset: PlanningToolset) {
		super()

        this.verboseParsingErrors = true
	}

	async _call(
		parameters: TPlanningCreateToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & {toolCall}
	) {
		if (!parameters.id) {
			throw new ToolParameterValidationError(`id is empty`)
		}

		const { subscriber } = config?.configurable ?? {}

        // Populated when a tool is called with a tool call from a model as input
		const toolCallId = config.toolCall?.id
        return new Command({
            update: {
                plans: {
                    [parameters.id]: {
                        ...parameters,
						steps: parameters.steps.map((content) => ({content}))
                    }
                },
                // update the message history
                messages: [
                    {
                        role: 'tool',
                        content: `Plan creation completed!`,
                        tool_call_id: toolCallId
                    }
                ]
            }
        })
	}
}
