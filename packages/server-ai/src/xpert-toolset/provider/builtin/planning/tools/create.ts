import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getContextVariable } from '@langchain/core/context'
import { Command, LangGraphRunnableConfig } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	CONTEXT_VARIABLE_CURRENTSTATE,
	getToolCallIdFromConfig,
	mapTranslationLanguage,
	STATE_VARIABLE_SYS
} from '@metad/contracts'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PLAN_STEPS_NAME, PLAN_TITLE_NAME, PlanningToolEnum, TPlan } from '../types'

export type TPlanningCreateToolParameters = TPlan

export class PlanningCreateTool extends BuiltinTool {
	readonly #logger = new Logger(PlanningCreateTool.name)

	static lc_name(): string {
		return PlanningToolEnum.CREATE_PLAN
	}
	name = PlanningToolEnum.CREATE_PLAN
	description = 'A tool for creating a plan'

	schema = z.object({
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
		config: LangGraphRunnableConfig & { toolCall }
	) {
		if (!parameters.title) {
			throw new ToolParameterValidationError(`title is empty`)
		}

		const { subscriber } = config?.configurable ?? {}
		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const lang = currentState[STATE_VARIABLE_SYS]?.language
		const toolCallId = getToolCallIdFromConfig(config)

		const plan = {
			title: parameters.title,
			steps: parameters.steps.map((content, index) => ({ index, content }))
		}

		const i18n = await this.toolset.translate('toolset.Planning', { lang: mapTranslationLanguage(lang) })
		// Tool message event
		dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: toolCallId,
			category: 'Computer',
			toolset: PlanningToolset.provider,
			tool: this.name,
			title: i18n.CreatedAPlan,
			message: parameters.title,
			data: plan
		}).catch((err) => {
			this.#logger.error(err)
		})

		// Populated when a tool is called with a tool call from a model as input
		return new Command({
			update: {
				[PLAN_TITLE_NAME]: plan.title,
				[PLAN_STEPS_NAME]: plan.steps,
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
