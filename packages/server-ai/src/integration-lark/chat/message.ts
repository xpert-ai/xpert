import { Serializable } from '@langchain/core/load/serializable'
import { I18nObject, IChatMessage, TSensitiveOperation } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { LarkConversationService } from '../conversation.service'
import {
	ChatLarkContext,
	isConfirmAction,
	isEndAction,
	isRejectAction,
	LARK_CONFIRM,
	LARK_END_CONVERSATION,
	LARK_REJECT,
	TLarkConversationStatus
} from '../types'

export type ChatLarkMessageStatus = IChatMessage['status'] | 'continuing' | 'waiting' | TLarkConversationStatus

export interface ChatLarkMessageFields {
	// ID of lark message
	id: string;
	// ID of IChatMessage
	messageId: string;
	// Status of lark message
	status: ChatLarkMessageStatus
	header: any
	elements: any[]
}

export class ChatLarkMessage extends Serializable implements ChatLarkMessageFields {
	lc_namespace: string[] = ['lark',]
	lc_serializable = true

	get lc_attributes() {
		return {
			status: this.status,
			id: this.id,
			messageId: this.messageId,
			header: this.header,
			elements: this.elements
		}
	}

	static readonly headerTemplate = 'indigo'
	static readonly logoImgKey = 'img_v3_02e1_a8d74bc6-3c8a-4f66-b44f-c4cc837e285g'
	static readonly logoIcon = {
		tag: 'custom_icon',
		img_key: ChatLarkMessage.logoImgKey
	}
	static readonly helpUrl = 'https://mtda.cloud/docs/chatbi/feishu/bot/'

	private readonly logger = new Logger(ChatLarkMessage.name)

	// ID of lark message
	public id: string = null
	public status: ChatLarkMessageStatus = 'thinking'
	// ID of IChatMessage
	public messageId: string

	get larkService() {
		return this.chatContext.larkService
	}

	public header = null
	public elements = []

	constructor(
		private chatContext: ChatLarkContext,
		private options: {
			userId?: string
			xpertId?: string
			text?: string
		} & Partial<ChatLarkMessageFields>,
		private conversation: LarkConversationService
	) {
		super(options)
		this.id = options.id
		this.messageId = options.messageId
		this.status = options.status
		this.header = options.header
		this.elements = options.elements ?? []
	}

	getTitle() {
		switch (this.status) {
			case 'thinking':
				return '正在思考...'
			case 'continuing':
				return '继续思考...'
			case 'waiting':
				return '还在思考，请稍后...'
			case 'interrupted':
				return '请确认'
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

		console.log(`2: ${this.status}`)

		if (elements[elements.length - 1]?.tag !== 'hr') {
			elements.push({ tag: 'hr' })
		}
		if (this.status === 'end') {
			elements.push({
				tag: 'markdown',
				content: `对话已结束。如果您有其他问题，欢迎随时再来咨询。`
			})
		} else {
			elements.push(this.getEndAction())
		}

		return {
			elements
		}
	}

	getEndAction() {
		console.log(`3: ${this.status}`)
		return {
			tag: 'action',
			layout: 'default',
			actions: [
				...(this.status === 'interrupted' ? this.getInterruptedActions() : []),
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
						url: ChatLarkMessage.helpUrl
					}
				}
			]
		}
	}

	getInterruptedActions() {
		return [
			{
				tag: 'button',
				text: {
					tag: 'plain_text',
					content: '确认'
				},
				type: 'primary',
				width: 'default',
				size: 'medium',
				value: LARK_CONFIRM
			},
			{
				tag: 'button',
				text: {
					tag: 'plain_text',
					content: '拒绝'
				},
				type: 'danger',
				width: 'default',
				size: 'medium',
				value: LARK_REJECT
			}
		]
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

		console.log(`1: ${this.status}`)
		const elements = this.getCard()
		console.log(`4: ${this.status}`)

		if (this.id) {
			this.larkService
				.patchAction(this.chatContext, this.id, {
					...elements,
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
					...elements,
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

	async onAction(action: { value: string }, callback?: (action) => void) {
		if (isEndAction(action?.value)) {
			await this.conversation.endConversation(this.chatContext, this.options.userId, this.options.xpertId)
		} else if (isConfirmAction(action?.value)) {
			await this.conversation.confirm(this.options.xpertId, this)
		} else if (isRejectAction(action?.value)) {
			await this.conversation.reject(this.options.xpertId, this)
		} else if (typeof action?.value === 'string') {
			await this.conversation.ask(this.options.xpertId, action.value, this)
		} else {
			callback?.(action)
		}
	}

	async confirm(operation: TSensitiveOperation) {
		await this.update({
			status: 'interrupted',
			elements: createConfirmMessage(operation),
			action: (action) => {
				console.log(action)
			}
		})
	}
}

export type ChatStack = {
	text: string
	message: ChatLarkMessage
}

// 构造 Lark 消息卡片
function createConfirmMessage(operation: TSensitiveOperation) {
	// Helper: 处理多语言或默认值
	const resolveI18n = (i18n: I18nObject | string): string =>
		typeof i18n === 'string' ? i18n : i18n?.zh_Hans || i18n?.en_US || ''

	const toolElements = operation.toolCalls.map((toolCall, index) => {
		const { call, parameters } = toolCall
		const paramsElements = []
		parameters.map((param) => {
			paramsElements.push({
				tag: 'markdown',
				content: `**${resolveI18n(param.title || param.name)}** <text_tag color='turquoise'>${param.name}</text_tag>: ${call.args[param.name]}`
			})

			// paramsElements.push({
			// 	tag: 'input',
			// 	placeholder: {
			// 		tag: 'plain_text',
			// 		content: resolveI18n(param.placeholder || '请输入...')
			// 	},
			// 	label: {
			// 		// 文本标签，即对输入框的描述，用于提示用户要填写的内容。
			// 		tag: 'plain_text',
			// 		content: resolveI18n(param.title || param.name) + ':'
			// 	},
			// 	default_value: call.args[param.name],
			// 	width: 'default',
			// 	name: param.name,
			// 	disabled: true,
			// 	fallback: {
			// 		tag: 'fallback_text',
			// 		text: {
			// 			tag: 'plain_text',
			// 			content: '仅支持在飞书 V6.8 及以上版本使用'
			// 		}
			// 	}
			// })
		})

		return [
			{
				tag: 'markdown',
				content: `**${toolCall.info.title || toolCall.info.name}**: *${toolCall.info.description}*`
			},
			...paramsElements
		]
	})

	return [
		...toolElements.flat(),
		{
			tag: 'hr',
			margin: '0px 0px 10px 0px'
		}

		// {
		// 	tag: 'form',
		// 	elements: [
		// 		...toolElements.flat(),
		// 		{
		// 			tag: 'hr',
		// 			"margin": "0px 0px 10px 0px"
		// 		},
		// {
		// 	tag: 'action',
		// 	layout: 'default',
		// 	actions: [
		// 		{
		// 			tag: 'button',
		// 			text: {
		// 				tag: 'plain_text',
		// 				content: '确认'
		// 			},
		// 			type: 'primary',
		// 			width: 'default',
		// 			size: 'medium',
		// 			value: LARK_CONFIRM,
		// 			form_action_type: 'submit',
		// 			name: 'Button_confirm'
		// 		},
		// 		{
		// 			tag: 'button',
		// 			text: {
		// 				tag: 'plain_text',
		// 				content: '拒绝'
		// 			},
		// 			type: 'danger',
		// 			width: 'default',
		// 			size: 'medium',
		// 			value: LARK_REJECT,
		// 			name: 'Button_reject'
		// 		}
		// 	]
		// }
		// ],
		// 	name: 'Form_m55io38s'
		// }
	]
}
