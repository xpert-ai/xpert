import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getContextVariable } from '@langchain/core/context'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { CONTEXT_VARIABLE_CURRENTSTATE } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { BuiltinTool } from '../../builtin-tool'
import { PlanningToolset } from '../planning'
import { PLAN_STEPS_NAME, PLAN_TITLE_NAME, PlanningToolEnum } from '../types'

export type TPlanningListToolParameters = {
	//
}

export class PlanningListTool extends BuiltinTool {
	readonly #logger = new Logger(PlanningListTool.name)

	static lc_name(): string {
		return PlanningToolEnum.LIST_PLANS
	}
	name = PlanningToolEnum.LIST_PLANS
	description = 'A tool for list all plans'

	schema = z.object({})

	constructor(private toolset: PlanningToolset) {
		super()

		this.verboseParsingErrors = true
	}

	async _call(
		parameters: TPlanningListToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig
	) {
		const { subscriber } = config?.configurable ?? {}

		const currentState = getContextVariable(CONTEXT_VARIABLE_CURRENTSTATE)
		const planSteps = currentState[PLAN_STEPS_NAME]
		const planTitle = currentState[PLAN_TITLE_NAME]

		return JSON.stringify({
			title: planTitle,
			steps: planSteps
		})
	}
}
