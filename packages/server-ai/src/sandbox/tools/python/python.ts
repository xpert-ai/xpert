import { IXpertToolset } from '@metad/contracts'
import { PythonToolEnum } from './types'
import { PythonExecuteTool } from './tools/python_execute'
import { BuiltinToolset, TBuiltinToolsetParams } from '../../../shared'

export class PythonToolset extends BuiltinToolset {
	static provider = 'python'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(PythonToolset.provider, toolset, params)
	}

	async initTools() {
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
}
