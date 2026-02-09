import * as lark from '@larksuiteoapi/node-sdk'
import { Injectable, Logger } from '@nestjs/common'
import { IIntegration, TIntegrationLarkOptions } from '@metad/contracts'
import { Request, Response, NextFunction } from 'express'
import {
	IChatChannel,
	ChatChannel,
	TChatChannelMeta,
	TChatChannelCapabilities,
	TChatContext,
	TChatSendResult,
	TChatEventContext,
	TChatEventHandlers,
	TChatInboundMessage,
	TChatCardAction,
	CHAT_CHANNEL_TEXT_LIMITS
} from '@xpert-ai/plugin-sdk'
import { LarkService } from './lark.service'

/**
 * Lark Chat Channel Strategy
 *
 * Implements IChatChannel for bidirectional messaging with Lark (Feishu) platform.
 * Supports receiving messages via webhook and sending messages back.
 *
 * Features:
 * - Receive text messages from users
 * - Handle @mentions in group chats
 * - Send text, markdown, and interactive card messages
 * - Update existing messages (streaming support)
 * - Handle card button interactions
 *
 * @example
 * ```typescript
 * // Get the channel from registry
 * const channel = chatChannelRegistry.get('lark')
 *
 * // Send a text message
 * await channel.sendText(ctx, 'Hello!')
 *
 * // Send a markdown message
 * await channel.sendMarkdown(ctx, '**Bold** text')
 *
 * // Send an interactive card
 * await channel.sendCard(ctx, {
 *   header: { title: { tag: 'plain_text', content: 'Title' } },
 *   elements: [{ tag: 'markdown', content: 'Card content' }]
 * })
 * ```
 */
@Injectable()
@ChatChannel('lark')
export class LarkChannelStrategy implements IChatChannel<TIntegrationLarkOptions> {
	private readonly logger = new Logger(LarkChannelStrategy.name)

	constructor(private readonly larkService: LarkService) {}

	meta: TChatChannelMeta = {
		type: 'lark',
		label: '飞书 / Lark',
		description: '通过飞书平台进行双向消息通信',
		icon: 'lark',
		configSchema: {
			type: 'object',
			properties: {
				appId: { type: 'string', description: 'App ID' },
				appSecret: { type: 'string', description: 'App Secret' },
				verificationToken: { type: 'string', description: 'Verification Token' },
				encryptKey: { type: 'string', description: 'Encrypt Key' },
				isLark: { type: 'boolean', description: '是否为国际版 Lark' }
			},
			required: ['appId', 'appSecret']
		}
	}

	capabilities: TChatChannelCapabilities = {
		markdown: true,
		card: true,
		cardAction: true,
		updateMessage: true,
		mention: true,
		group: true,
		thread: false, // Lark does not support thread
		media: true,
		textChunkLimit: CHAT_CHANNEL_TEXT_LIMITS['lark'], // 4000
		streamingUpdate: true // Support streaming update
	}

	// ==================== Inbound (Receive Messages) ====================

	/**
	 * Create Webhook/Event handler
	 *
	 * Returns Express middleware that handles inbound webhooks from Lark.
	 * The middleware:
	 * 1. Validates request (signature, token)
	 * 2. Parses events
	 * 3. Calls appropriate handlers (onMessage, onMention, onCardAction)
	 *
	 * @param ctx - Event context containing integration config
	 * @param handlers - Callback functions for different event types
	 * @returns Express middleware
	 */
	createEventHandler(
		ctx: TChatEventContext<TIntegrationLarkOptions>,
		handlers: TChatEventHandlers
	): (req: Request, res: Response, next?: NextFunction) => Promise<void> {
		const { integration } = ctx

		const dispatcher = new lark.EventDispatcher({
			verificationToken: integration.options.verificationToken,
			encryptKey: integration.options.encryptKey,
			loggerLevel: lark.LoggerLevel.debug
		})

		// Register message event
		dispatcher.register({
			'im.message.receive_v1': async (data) => {
				this.logger.verbose('im.message.receive_v1:', data)

				const message = this.parseInboundMessage(data, ctx)
				if (!message) {
					return true
				}

				try {
					// Group chat: check if bot is mentioned
					if (message.chatType === 'group') {
						const botInfo = await this.getBotInfo(integration)
						if (this.isBotMentioned(message, botInfo.id)) {
							await handlers.onMention?.(message, ctx)
						}
					} else {
						// Private chat: directly call onMessage
						await handlers.onMessage?.(message, ctx)
					}
				} catch (error) {
					this.logger.error('Error handling message:', error)
				}

				return true
			},

			'card.action.trigger': async (data: any) => {
				this.logger.verbose('card.action.trigger:', data)

				const action = this.parseCardAction(data, ctx)
				if (action) {
					try {
						await handlers.onCardAction?.(action, ctx)
					} catch (error) {
						this.logger.error('Error handling card action:', error)
					}
				}

				return true
			}
		})

		return lark.adaptExpress(dispatcher, { autoChallenge: true })
	}

	/**
	 * Parse inbound event to unified message format
	 *
	 * @param event - Platform raw event
	 * @param ctx - Event context
	 * @returns Parsed message or null if not a message event
	 */
	parseInboundMessage(event: any, _ctx: TChatEventContext<TIntegrationLarkOptions>): TChatInboundMessage | null {
		const { message, sender } = event
		if (!message) return null

		let content = ''
		let contentType: TChatInboundMessage['contentType'] = 'text'

		try {
			const parsed = JSON.parse(message.content)
			content = parsed.text || ''
		} catch {
			content = message.content
		}

		// Determine contentType based on message_type
		switch (message.message_type) {
			case 'text':
				contentType = 'text'
				break
			case 'image':
				contentType = 'image'
				break
			case 'file':
				contentType = 'file'
				break
			case 'audio':
				contentType = 'voice'
				break
		}

		return {
			messageId: message.message_id,
			chatId: message.chat_id,
			chatType: message.chat_type === 'p2p' ? 'private' : 'group',
			senderId: sender?.sender_id?.open_id,
			senderName: sender?.sender_id?.user_id,
			content,
			contentType,
			mentions: message.mentions?.map((m: any) => ({
				id: m.id?.open_id,
				name: m.name
			})),
			timestamp: parseInt(message.create_time),
			raw: event
		}
	}

	/**
	 * Parse card action event
	 *
	 * @param event - Platform raw event
	 * @param ctx - Event context
	 * @returns Parsed card action or null if not a card action event
	 */
	parseCardAction(event: any, _ctx: TChatEventContext<TIntegrationLarkOptions>): TChatCardAction | null {
		const { action, context, operator } = event
		if (!action || !context) return null

		return {
			type: action.tag,
			value: action.value ?? action.option,
			messageId: context.open_message_id,
			chatId: context.open_chat_id,
			userId: operator?.open_id,
			raw: event
		}
	}

	/**
	 * Check if bot is mentioned in the message
	 *
	 * @param message - Inbound message
	 * @param botId - Bot's platform user ID
	 * @returns true if bot is mentioned
	 */
	isBotMentioned(message: TChatInboundMessage, botId: string): boolean {
		return message.mentions?.some((m) => m.id === botId) ?? false
	}

	// ==================== Outbound (Send Messages) ====================

	/**
	 * Send text message
	 *
	 * @param ctx - Chat context (supports chatId for group or userId for private)
	 * @param content - Text content
	 * @returns Send result
	 */
	async sendText(ctx: TChatContext, content: string): Promise<TChatSendResult> {
		try {
			const client = await this.larkService.getOrCreateLarkClientById(ctx.integration.id)
			const { receiveIdType, receiveId } = this.resolveReceiveId(ctx)

			const result = await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: receiveId,
					msg_type: 'text',
					content: JSON.stringify({ text: content })
				}
			})
			return { success: true, messageId: result.data?.message_id }
		} catch (error: any) {
			this.logger.error('Failed to send text message:', error)
			return { success: false, error: error.message }
		}
	}

	/**
	 * Send markdown message
	 *
	 * Note: Lark does not support pure markdown messages, so we use interactive card
	 *
	 * @param ctx - Chat context (supports chatId for group or userId for private)
	 * @param content - Markdown content
	 * @returns Send result
	 */
	async sendMarkdown(ctx: TChatContext, content: string): Promise<TChatSendResult> {
		try {
			const client = await this.larkService.getOrCreateLarkClientById(ctx.integration.id)
			const { receiveIdType, receiveId } = this.resolveReceiveId(ctx)

			const result = await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: receiveId,
					msg_type: 'interactive',
					content: JSON.stringify({
						elements: [{ tag: 'markdown', content }]
					})
				}
			})
			return { success: true, messageId: result.data?.message_id }
		} catch (error: any) {
			this.logger.error('Failed to send markdown message:', error)
			return { success: false, error: error.message }
		}
	}

	/**
	 * Send interactive card
	 *
	 * @param ctx - Chat context (supports chatId for group or userId for private)
	 * @param card - Card content (Lark message card format)
	 * @returns Send result
	 */
	async sendCard(ctx: TChatContext, card: any): Promise<TChatSendResult> {
		try {
			const client = await this.larkService.getOrCreateLarkClientById(ctx.integration.id)
			const { receiveIdType, receiveId } = this.resolveReceiveId(ctx)

			const result = await client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: receiveId,
					msg_type: 'interactive',
					content: JSON.stringify(card)
				}
			})
			return { success: true, messageId: result.data?.message_id }
		} catch (error: any) {
			this.logger.error('Failed to send card message:', error)
			return { success: false, error: error.message }
		}
	}

	/**
	 * Send media message (image, file)
	 *
	 * @param ctx - Chat context
	 * @param media - Media info
	 * @returns Send result
	 */
	async sendMedia(
		ctx: TChatContext,
		media: {
			type: 'image' | 'file' | 'audio' | 'video'
			url?: string
			content?: Buffer
			filename?: string
		}
	): Promise<TChatSendResult> {
		try {
			const client = await this.larkService.getOrCreateLarkClientById(ctx.integration.id)

			// For now, only support image_key if url is provided
			// Full implementation would need to upload the file first
			if (media.type === 'image' && media.url) {
				const result = await client.im.message.create({
					params: { receive_id_type: 'chat_id' },
					data: {
						receive_id: ctx.chatId,
						msg_type: 'image',
						content: JSON.stringify({ image_key: media.url })
					}
				})
				return { success: true, messageId: result.data?.message_id }
			}

			return { success: false, error: 'Media type not fully supported yet' }
		} catch (error: any) {
			this.logger.error('Failed to send media message:', error)
			return { success: false, error: error.message }
		}
	}

	/**
	 * Update/edit existing message
	 *
	 * @param ctx - Chat context
	 * @param messageId - Message ID to update
	 * @param content - New content (string for text, object for card)
	 * @returns Send result
	 */
	async updateMessage(ctx: TChatContext, messageId: string, content: string | any): Promise<TChatSendResult> {
		try {
			const client = await this.larkService.getOrCreateLarkClientById(ctx.integration.id)
			const contentStr = typeof content === 'string' ? JSON.stringify({ text: content }) : JSON.stringify(content)

			await client.im.message.patch({
				path: { message_id: messageId },
				data: { content: contentStr }
			})
			return { success: true, messageId }
		} catch (error: any) {
			this.logger.error('Failed to update message:', error)
			return { success: false, error: error.message }
		}
	}

	// ==================== Utility Methods ====================

	/**
	 * Resolve receive ID and type from chat context
	 * Supports both chatId (group) and userId (private message)
	 *
	 * @param ctx - Chat context
	 * @returns receive_id_type and receive_id
	 */
	private resolveReceiveId(ctx: TChatContext): {
		receiveIdType: 'chat_id' | 'open_id' | 'user_id'
		receiveId: string
	} {
		// Prefer chatId for group chats
		if (ctx.chatId) {
			return { receiveIdType: 'chat_id', receiveId: ctx.chatId }
		}
		// Fall back to userId for private messages (using open_id type)
		if (ctx.userId) {
			return { receiveIdType: 'open_id', receiveId: ctx.userId }
		}
		// Should not reach here, but default to empty chatId
		this.logger.warn('No chatId or userId provided in context')
		return { receiveIdType: 'chat_id', receiveId: '' }
	}

	/**
	 * Get bot info
	 *
	 * @param integration - Integration config
	 * @returns Bot info (ID, name, avatar)
	 */
	async getBotInfo(integration: IIntegration<TIntegrationLarkOptions>): Promise<{
		id: string
		name?: string
		avatar?: string
	}> {
		const client = this.larkService.createClient(integration)
		const res = await client.request({
			method: 'GET',
			url: 'https://open.feishu.cn/open-apis/bot/v3/info',
			data: {},
			params: {}
		})
		return {
			id: res.bot?.open_id,
			name: res.bot?.app_name,
			avatar: res.bot?.avatar_url
		}
	}

	/**
	 * Validate integration config
	 *
	 * @param config - Config to validate
	 * @returns Validation result
	 */
	async validateConfig(config: TIntegrationLarkOptions): Promise<{
		valid: boolean
		errors?: string[]
	}> {
		const errors: string[] = []

		if (!config.appId) {
			errors.push('App ID is required')
		}

		if (!config.appSecret) {
			errors.push('App Secret is required')
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined
		}
	}

	/**
	 * Test connection
	 *
	 * @param integration - Integration to test
	 * @returns Test result
	 */
	async testConnection(integration: IIntegration<TIntegrationLarkOptions>): Promise<{
		success: boolean
		message?: string
	}> {
		try {
			const botInfo = await this.getBotInfo(integration)
			if (botInfo.id) {
				return {
					success: true,
					message: `Connected to bot: ${botInfo.name || botInfo.id}`
				}
			}
			return {
				success: false,
				message: 'Failed to get bot info'
			}
		} catch (error: any) {
			return {
				success: false,
				message: error.message
			}
		}
	}
}
