import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { PythonToolEnum } from './types'
import { PythonExecuteTool } from './tools/python_execute'
import { BuiltinTool, BuiltinToolset, TBuiltinToolsetParams } from '../../../xpert-toolset'

export class PythonToolset extends BuiltinToolset {
	static provider = 'python'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(PythonToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => _.enabled).forEach((tool) => {
				switch(tool.name) {
					case (PythonToolEnum.PYTHON_EXECUTE): {
						this.tools.push(new PythonExecuteTool(this))
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
