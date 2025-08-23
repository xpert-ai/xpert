import { IXpertToolset, TStateVariable, TToolCredentials, XpertParameterTypeEnum } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { PLAN_STEPS_NAME, PLAN_TITLE_NAME, PlanningToolEnum } from './types'
import { PlanningCreateTool } from './tools/create'
import { PlanningListTool } from './tools/list'
import { PlanningDeleteStepTool } from './tools/delete'
import { PlanningUpdateStepTool } from './tools/update-step'

export class PlanningToolset extends BuiltinToolset {
	static provider = 'planning'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(PlanningToolset.provider, toolset, params)
	}

	async getVariables() {
		return [
			{
				name: PLAN_TITLE_NAME,
				type: XpertParameterTypeEnum.STRING,
				description: 'Plan title',
				reducer: (a, b) => b ?? a,
				default: () => '',
			} as TStateVariable,
			{
				name: PLAN_STEPS_NAME,
				type: 'array[object]',
				description: 'Plan steps',
				reducer: (a, b) => b ?? a,
				default: () => [],
				item: [
					{
						type: XpertParameterTypeEnum.STRING,
						name: 'index',
						title: 'Index of step'
					},
					{
						type: XpertParameterTypeEnum.STRING,
						name: 'content',
						title: 'Content of step'
					}
				]
			} as TStateVariable
		]
	}

	async initTools() {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				switch(tool.name) {
					case (PlanningToolEnum.CREATE_PLAN): {
						this.tools.push(new PlanningCreateTool(this))
						break
					}
					case (PlanningToolEnum.LIST_PLANS): {
						this.tools.push(new PlanningListTool(this))
						break
					}
					case (PlanningToolEnum.DELETE_PLAN_STEP): {
						this.tools.push(new PlanningDeleteStepTool(this))
						break
					}
					case (PlanningToolEnum.UPDATE_PLAN_STEP): {
						this.tools.push(new PlanningUpdateStepTool(this))
						break
					}
				}
			})

		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}
}
