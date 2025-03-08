import { IXpertToolset, TStateVariable, TStateVariableType, TToolCredentials } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'

export class BashToolset extends BuiltinToolset {
	static provider = 'bash'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(BashToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				// switch(tool.name) {
				// 	case (PlanningToolEnum.CREATE_PLAN): {
				// 		this.tools.push(new PlanningCreateTool(this))
				// 		break
				// 	}
	
				// }
			})

		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}
}
