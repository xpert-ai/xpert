import { Tool } from '@langchain/core/tools'
import { ChatMessageTypeEnum, IXpertToolset, JSONValue } from '@metad/contracts'
import { Indicator } from '@metad/ocap-core'
import { TBuiltinToolsetParams } from '@metad/server-ai'
import { shortuuid } from '@metad/server-common'
import { Subscriber } from 'rxjs'
import { AbstractChatBIToolset } from '../chatbi/chatbi-toolset'
import { ChatBIToolsEnum } from '../chatbi/types'
import { createChatAnswerTool } from './tools/answer_question'
import { createWelcomeTool } from './tools/welcome'
import { ChatBILarkToolsEnum } from './types'

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
				createChatAnswerTool(
					{
						dsCoreService: this.dsCoreService,
						chatbi: this
					},
					this.toolsetCredentials
				) as unknown as Tool
			)
		}

		return this.tools
	}

	async onCreatedIndicator(subscriber: Subscriber<MessageEvent>, indicator: Indicator, lang: string) {
		subscriber.next({
			data: {
				type: ChatMessageTypeEnum.MESSAGE,
				data: {
					id: shortuuid(),
					type: 'update',
					data: {
						elements: [
							{
								tag: 'markdown',
								content:
									`:Pin: ${await this.translate('toolset.ChatBI.NewCalculatedIndicator', { lang })}\n` +
									`**${await this.translate('toolset.ChatBI.Name', { lang })}:** ${indicator.name}\n` +
									`**${await this.translate('toolset.ChatBI.Code', { lang })}:** ${indicator.code}\n` +
									`**${await this.translate('toolset.ChatBI.Formula', { lang })}:**\n` +
									`\`\`\`SQL\n` +
									`${indicator.formula}\n` +
									`\`\`\`\n` +
									`${indicator.unit ? `**${await this.translate('toolset.ChatBI.Unit', { lang })}:** ${indicator.unit}\n` : ''}`
							},
							{
								tag: 'hr'
							}
						]
					} as unknown as JSONValue
				}
			}
		} as MessageEvent)
	}
}
