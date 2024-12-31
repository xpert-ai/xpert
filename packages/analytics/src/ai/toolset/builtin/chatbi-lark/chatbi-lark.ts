import { Tool } from '@langchain/core/tools'
import { IXpertToolset } from '@metad/contracts'
import { TBuiltinToolsetParams } from '@metad/server-ai'
import { AbstractChatBIToolset } from '../chatbi/chatbi-toolset'
import { createWelcomeTool } from './tools/welcome'
import { ChatBILarkToolsEnum } from './types'
import { createChatAnswerTool } from './tools/answer_question'
import { ChatBIToolsEnum } from '../chatbi/types'
import { createShowIndicatorsTool } from './tools/show_indicators'

export class ChatBILarkToolset extends AbstractChatBIToolset {
	static provider = 'chatbi-lark'

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(ChatBILarkToolset.provider, toolset, params)
	}

	async initTools() {
		await super.initTools()

		const tools = this.toolset.tools.filter((_) => _.enabled)
		if (tools.find((_) => _.name === ChatBILarkToolsEnum.WELCOME)) {
			this.tools.push(
				createWelcomeTool(this, {
					dsCoreService: this.dsCoreService,
					models: this.models,
					logger: this.logger
				})
			)
		}

		// if (tools.find((_) => _.name === ChatBIToolsEnum.SHOW_INDICATORS)) {
		// 	this.tools.push(
		// 		createShowIndicatorsTool({
		// 			dsCoreService: this.dsCoreService,
		// 			entityType: null
		// 		}) as unknown as Tool
		// 	)
		// }

		if (tools.find((_) => _.name === ChatBIToolsEnum.ANSWER_QUESTION)) {
			this.tools.push(
				createChatAnswerTool({
					dsCoreService: this.dsCoreService,
					entityType: null,
					logger: this.logger
				}, this.toolsetCredentials) as unknown as Tool
			)
		}

		return this.tools
	}
}
