import { isEnableTool, IXpertToolset, TStateVariable } from '@metad/contracts'
import {
	BuiltinToolset,
	TBuiltinToolsetParams
} from '@metad/server-ai'
import { Logger } from '@nestjs/common'

export class IndicatorsToolset extends BuiltinToolset {
	protected logger = new Logger(IndicatorsToolset.name)

	static provider = 'indicators'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(IndicatorsToolset.provider, toolset, params)
	}

	async getVariables() {
		return [
			{
				name: 'tool.indicators',
				type: 'array[object]',
				description: 'Indicators in cube',
				reducer: (a, b) => {
					return [...a.filter((_) => !b.some((indicator) => indicator.code === _.code)), ...b]
				},
				default: () => {
					return []
				}
			} as TStateVariable
		]
	}

	async initTools() {
		this.tools = []
		const tools = this.toolset.tools.filter((_) => isEnableTool(_, this.toolset))

		return this.tools
	}
}
