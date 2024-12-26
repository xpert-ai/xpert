import { IChatMessage } from '@metad/contracts'
import { Logger } from '@nestjs/common';
import { ChatLarkContext, LARK_END_CONVERSATION, TLarkConversationStatus } from '../types'
import { LarkConversationService } from '../conversation.service'

export type ChatLarkMessageStatus = IChatMessage['status'] | 'continuing' | 'waiting' | TLarkConversationStatus

export class ChatLarkMessage {
	static readonly headerTemplate = 'indigo'
	static readonly logoImgKey = 'img_v3_02e1_a8d74bc6-3c8a-4f66-b44f-c4cc837e285g'
	static readonly logoIcon = {
		tag: 'custom_icon',
		img_key: ChatLarkMessage.logoImgKey
	}
	static readonly helpUrl = 'https://mtda.cloud/docs/chatbi/feishu/bot/'

	private readonly logger = new Logger(ChatLarkMessage.name)

	private id: string = null
	public status: ChatLarkMessageStatus = 'thinking'

	get larkService() {
		return this.chatContext.larkService
	}

	private header = null
	private elements = []

	constructor(
		private chatContext: ChatLarkContext,
		private options: {userId: string; xpertId: string; text: string},
		private conversation?: LarkConversationService
	) {}

	getTitle() {
		switch (this.status) {
			case 'thinking':
				return '正在思考...'
			case 'continuing':
				return '继续思考...'
			case 'waiting':
				return '还在思考，请稍后...'
			default:
				return ''
		}
	}

	getSubtitle() {
		return this.options.text
	}

	getHeader() {
		return {
			title: {
				tag: 'plain_text',
				content: this.getTitle()
			},
			subtitle: {
				tag: 'plain_text', // 固定值 plain_text。
				content: this.getSubtitle()
			},
			template: ChatLarkMessage.headerTemplate,
			ud_icon: {
				token: 'myai_colorful', // 图标的 token
				style: {
					color: 'red' // 图标颜色
				}
			}
		}
	}

	getCard() {
		const elements = [...this.elements]
		if (this.status !== 'end') {
			elements.push({ tag: 'hr' })
			elements.push(this.getEndAction())
		}
		return {
			elements
		}
	}

	getEndAction() {
		return {
			tag: 'action',
			layout: 'default',
			actions: [
				{
					tag: 'button',
					text: {
						tag: 'plain_text',
						content: '结束对话'
					},
					type: 'text',
					complex_interaction: true,
					width: 'default',
					size: 'medium',
					value: LARK_END_CONVERSATION
				},
				{
					tag: 'button',
					text: {
						tag: 'plain_text',
						content: '帮助文档'
					},
					type: 'text',
					complex_interaction: true,
					width: 'default',
					size: 'medium',
					multi_url: {
						url: ChatLarkMessage.helpUrl,
					}
				}
			]
		}
	}

	async update(options?: {
		status?: ChatLarkMessageStatus
		elements?: any[]
		header?: any
		action?: (action) => void
	}) {
		if (options?.status) {
			this.status = options.status
		}
		if (options?.elements) {
			this.elements.push(...options.elements)
		}
		if (options?.header) {
			this.header = options.header
		}
		if (this.id) {
			this.larkService
				.patchAction(this.chatContext, this.id, {
					...this.getCard(),
					header: this.header ?? this.getHeader()
				})
				.subscribe({
					next: (message) => {
						this.onAction(message.action, options?.action)
					},
					error: (err) => {
						console.error(err)
					}
				})
		} else {
			const result = await this.larkService.interactiveActionMessage(
				this.chatContext,
				{
					...this.getCard(),
					header: this.header ?? this.getHeader()
				},
				{
					next: async (message) => {
						this.onAction(message.action, options?.action)
					},
					error: (err) => {
						console.error(err)
					}
				}
			)

			this.id = result.data.message_id
		}
	}

	async onAction(action: {value: string}, callback?: (action) => void) {
		if (action?.value === LARK_END_CONVERSATION || action?.value === `"${LARK_END_CONVERSATION}"`) {
			await this.update({status: 'end', elements: [
				{
					tag: 'markdown',
					content: `对话已结束。如果您有其他问题，欢迎随时再来咨询。`
				}
			]})
			await this.conversation.endConversation(this.options.userId, this.options.xpertId)
		} else if (typeof action.value === 'string') {
			await this.conversation.ask(this.options.xpertId, action.value, this)
		} else {
			callback?.(action)
		}
	}

}

export type ChatStack = {
	text: string
	message: ChatLarkMessage
}
