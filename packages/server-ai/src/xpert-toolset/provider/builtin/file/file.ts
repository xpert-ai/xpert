import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'

export class FileToolset extends BuiltinToolset {
	static provider = 'file'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(FileToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				// switch(tool.name) {
				// 	case (FileToolEnum.CREATE_FILE): {
				// 		this.tools.push(new CreateFileTool(this))
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
