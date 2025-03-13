import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'

export class BrowserToolset extends BuiltinToolset {
	static provider = 'browser'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(BrowserToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				// switch(tool.name) {
				// 	 case (BrowserToolEnum.NAVIGATE): {
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
