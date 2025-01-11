import { Serializable } from '@langchain/core/load/serializable'
import { I18nObject, IChatMessage, TranslateOptions, TSensitiveOperation, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import {
	ChatLarkContext,
	LARK_CONFIRM,
	LARK_END_CONVERSATION,
	LARK_REJECT,
	TLarkConversationStatus
} from '../types'
import { LarkService } from '../lark.service'

export type ChatLarkMessageStatus = IChatMessage['status'] | 'continuing' | 'waiting' | 'done' | TLarkConversationStatus

export interface ChatLarkMessageFields {
	// ID of lark message
	id: string;
	// ID of IChatMessage
	messageId: string;
	// Status of lark message
	status: ChatLarkMessageStatus
	language: string
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
			elements: this.elements,
			language: this.language,
		}
	}

	static readonly headerTemplate = 'indigo'
	static readonly logoImgKey = 'img_v3_02i5_2fd70b28-1f68-4618-9e17-c9140c49bbfg'
	static readonly logoIcon = {
		tag: 'custom_icon',
		img_key: ChatLarkMessage.logoImgKey,
		corner_radius: "30%"
	}
	static readonly helpUrl = 'https://mtda.cloud/docs/chatbi/feishu/bot/'

	private readonly logger = new Logger(ChatLarkMessage.name)

	// ID of lark message
	public id: string = null
	// private prevStatus: ChatLarkMessageStatus = null
	public status: ChatLarkMessageStatus = 'thinking'
	// ID of IChatMessage
	public messageId: string
	public language: string

	get larkService() {
		return this.chatContext.larkService
	}

	public header = null
	public elements = []

	constructor(
		private chatContext: ChatLarkContext & {larkService: LarkService},
		private options: {
			text?: string
		} & Partial<ChatLarkMessageFields>,
	) {
		super(options)
		this.id = options.id
		this.messageId = options.messageId
		this.status = options.status
		this.language = options.language
		this.header = options.header
		this.elements = options.elements ?? []
	}

	async getTitle() {
		const status = await this.translate('integration.Lark.Status_' + this.status, {lang: this.language,})
		switch (this.status) {
			case 'thinking':
				return status
			case 'continuing':
				return status
			case 'waiting':
				return status
			case 'interrupted':
				return status
			default:
				return ''
		}
	}

	getSubtitle() {
		return this.options.text
	}

	async getHeader() {
		const title = await this.getTitle()
		const subTitle = this.getSubtitle()
		return title || subTitle ? {
			title: {
				tag: 'plain_text',
				content: title
			},
			subtitle: {
				tag: 'plain_text',
				content: subTitle
			},
			template: ChatLarkMessage.headerTemplate,
			ud_icon: {
				token: 'myai_colorful',
				style: {
					color: 'red'
				}
			}
		} : null
	}

	async getCard() {
		const elements = [...this.elements]
		
		if (this.status === 'end') {
			if (elements[elements.length - 1]?.tag !== 'hr') {
				elements.push({ tag: 'hr' })
			}
			elements.push({
				tag: 'markdown',
				content: await this.translate('integration.Lark.ConversationEnded', {lang: this.language,})
			})
		} else if (this.status !== 'done') {
			if (elements[elements.length - 1]?.tag !== 'hr') {
				elements.push({ tag: 'hr' })
			}
			elements.push(await this.getEndAction())
		}

		return {
			elements
		}
	}

	async getEndAction() {
		return {
			tag: 'action',
			layout: 'default',
			actions: [
				...(this.status === 'interrupted' ? (await this.getInterruptedActions()) : []),
				{
					tag: 'button',
					text: {
						tag: 'plain_text',
						content: await this.translate('integration.Lark.EndConversation', {lang: this.language,})
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
						content: await this.translate('integration.Lark.HelpDoc', {lang: this.language,})
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

	async getInterruptedActions() {
		return [
			{
				tag: 'button',
				text: {
					tag: 'plain_text',
					content: await this.translate('integration.Lark.Confirm', {lang: this.language,})
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
					content: await this.translate('integration.Lark.Reject', {lang: this.language,})
				},
				type: 'danger',
				width: 'default',
				size: 'medium',
				value: LARK_REJECT
			}
		]
	}

	/**
	 * Complete this message and a new message will be opened
	 */
	async done() {
		await this.update({status: 'done'})
	}

	/**
	 * Ending a Session (Conversation)
	 */
	async end() {
		await this.update({status: 'end'})
	}

	/**
	 * Reply to error message
	 * 
	 * @param message Error message
	 */
	async error(message: string) {
		await this.update({status: XpertAgentExecutionStatusEnum.ERROR, elements: [
			{
				tag: 'markdown',
				content: message
			}
		]})
	}

	async update(options?: {
		status?: ChatLarkMessageStatus
		elements?: any[]
		header?: any
		language?: string
		action?: (action) => void
	}) {
		if (options?.language) {
			this.language = options.language
		}
		if (options?.status) {
			this.status = options.status
		}
		if (options?.elements) {
			this.elements.push(...options.elements)
		}
		if (options?.header) {
			this.header = options.header
		}

		const elements = await this.getCard()
		if (this.id) {
			try {
				await this.larkService.patchAction(this.chatContext, this.id, {
					...elements,
					header: this.header ?? (await this.getHeader())
				})
			} catch(err) {
				console.error(err)
			}
		} else {
			const result = await this.larkService.interactiveActionMessage(
				this.chatContext,
				{
					...elements,
					header: this.header ?? (await this.getHeader())
				},
				{
					next: async (message) => {
						// this.onAction(message.action, options?.action)
					},
					error: (err) => {
						console.error(err)
					}
				}
			)

			this.id = result.data.message_id
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

	async translate(key: string, options: TranslateOptions) {
		return await this.larkService.translate(key, options)
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
		parameters?.map((param) => {
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
