import {
	isEnableTool,
	IXpertToolset,
	STATE_VARIABLE_FILES,
	TStateVariable,
	TToolCredentials,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { DeployTool } from './tools/deploy'
import { CodeProjectToolEnum } from './types'
import { BuiltinTool, BuiltinToolset, TBuiltinToolsetParams } from '../../../xpert-toolset'

export class CodeProjectToolset extends BuiltinToolset {
	static provider = 'code-project'

	public sandboxUrl: string
	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(CodeProjectToolset.provider, toolset, params)
	}

	async getVariables(): Promise<TStateVariable[]> {
		return [
			{
				name: STATE_VARIABLE_FILES,
				type: XpertParameterTypeEnum.ARRAY,
				reducer: (a, b) => {
					return [...a.filter((_) => !b.some((n) => n.filename === _.filename && n.type === _.type)), ...b]
				},
				default: () => []
			}
		]
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset.tools
				.filter((_) => isEnableTool(_, this.toolset))
				.forEach((tool) => {
					switch (tool.name) {
						// case CodeProjectToolEnum.Code: {
						// 	this.tools.push(createCodeTool())
						// 	break
						// }
						case CodeProjectToolEnum.Deploy: {
							this.tools.push(new DeployTool(this))
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
