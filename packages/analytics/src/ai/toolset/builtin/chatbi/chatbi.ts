import { Tool } from '@langchain/core/tools'
import { IXpertToolset } from '@metad/contracts'
import { TBuiltinToolsetParams } from '@metad/server-ai'
import { AbstractChatBIToolset } from './chatbi-toolset'
import { createShowIndicatorsTool } from './tools/show_indicators'
import { ChatBIToolsEnum } from './types'

export class ChatBIToolset extends AbstractChatBIToolset {
	static provider = 'chatbi'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(ChatBIToolset.provider, toolset, params)
	}

	async initTools() {
		await super.initTools()

		const tools = this.toolset.tools.filter((_) => _.enabled)

		if (tools.find((_) => _.name === ChatBIToolsEnum.SHOW_INDICATORS)) {
			this.tools.push(
				createShowIndicatorsTool({
					dsCoreService: this.dsCoreService,
					entityType: null
				}, this.toolsetCredentials) as unknown as Tool
			)
		}
		if (tools.find((_) => _.name === ChatBIToolsEnum.ANSWER_QUESTION)) {
			this.tools.push(
				this.createChatAnswerTool({
					dsCoreService: this.dsCoreService,
					entityType: null
				}, this.toolsetCredentials) as unknown as Tool
			)
		}

		return this.tools
	}
}
