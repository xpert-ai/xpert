import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BashExecTool } from './tools/execute'
import { BashToolEnum } from './types'
import { BuiltinTool, BuiltinToolset, TBuiltinToolsetParams } from '../../../xpert-toolset'

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
				switch(tool.name) {
					 case (BashToolEnum.BASH_EXECUTE): {
						this.tools.push(new BashExecTool(this))
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
