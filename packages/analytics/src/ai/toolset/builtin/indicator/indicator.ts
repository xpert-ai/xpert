import { IXpertToolset, TStateVariable, TToolCredentials } from '@metad/contracts'
import { referencesCommandName } from '@metad/copilot'
import {
	BuiltinTool,
	BuiltinToolset,
	CreateCopilotKnowledgeRetrieverCommand,
	TBuiltinToolsetParams
} from '@metad/server-ai'
import { Logger } from '@nestjs/common'
import { createIndicatorTool } from './tools/create_indicator'
import { IndicatorToolsEnum } from './types'

export class IndicatorToolset extends BuiltinToolset {
	protected logger = new Logger(IndicatorToolset.name)

	static provider = 'indicator'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(IndicatorToolset.provider, toolset, params)
	}

	getVariables() {
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

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		const tools = this.toolset.tools.filter((tool) => tool.enabled)
		if (tools.some((_) => _.name === IndicatorToolsEnum.CREATE_INDICATOR)) {
			this.tools.push(createIndicatorTool({ logger: this.logger, conversation: null }))
		}

		if (tools.some((_) => _.name === IndicatorToolsEnum.KNOWLEDGE_RETRIEVER)) {
			const referencesRetrieverTool = await this.commandBus.execute(
				new CreateCopilotKnowledgeRetrieverCommand({
					tenantId: this.tenantId,
					// 知识库跟着 copilot 的配置
					organizationId: this.organizationId,
					command: [referencesCommandName('calculated')],
					k: 3
				})
			)
			this.tools.push(referencesRetrieverTool)
		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		return null
	}
}
