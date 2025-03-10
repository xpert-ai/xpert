import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'

export class BrowserUseToolset extends BuiltinToolset {
	static provider = 'browser-use'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(BrowserUseToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				// switch(tool.name) {
				// 	 case (BrowserUseToolEnum.NAVIGATE): {
				// 		this.tools.push(new BashExecuteTool(this))
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
