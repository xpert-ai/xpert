import { IXpertToolset, TStateVariable, TStateVariableType, TToolCredentials } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { PlanningToolEnum } from './types'
import { PlanningCreateTool } from './tools/create'
import { PlanningListTool } from './tools/list'
import { PlanningDeleteTool } from './tools/delete'
import { PlanningUpdateStepTool } from './tools/update-step'

export class PlanningToolset extends BuiltinToolset {
	static provider = 'planning'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(PlanningToolset.provider, toolset, params)
	}

	getVariables() {
		return [
			{
				name: 'plans',
				type: 'object' as TStateVariableType,
				description: 'Plans',
				reducer: (a, b) => {
					return {
						...(a ?? {}),
						...(b ?? {})
					}
				},
				default: () => {
					return {}
				}
			} as TStateVariable
		]
	}

	async initTools(): Promise<BuiltinTool[]> {
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
					case (PlanningToolEnum.DELETE_PLAN): {
						this.tools.push(new PlanningDeleteTool(this))
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
