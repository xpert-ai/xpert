import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { CodeProjectToolEnum } from './types'

export class CodeProjectToolset extends BuiltinToolset {
	static provider = 'code-project'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(CodeProjectToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				// switch(tool.name) {
				// 	 case (CodeProjectToolEnum.Deploy): {
				// 		this.tools.push(new DeployTool(this))
				// 		break
				// 	 }
				// }
			})

		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}
}
