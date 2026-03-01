import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration, IUser, RolesEnum } from '@metad/contracts'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { isEqual } from 'date-fns'
import { NextFunction, Request, Response } from 'express'
import {
	CHAT_CHANNEL_TEXT_LIMITS,
	ChatChannel,
	getErrorMessage,
	IChatChannel,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	PluginContext,
	TChatCardAction,
	TChatChannelCapabilities,
	TChatChannelMeta,
	TChatContext,
	TChatEventContext,
	TChatEventHandlers,
	TChatInboundMessage,
	TChatSendResult,
	USER_PERMISSION_SERVICE_TOKEN,
	UserPermissionService,
} from '@xpert-ai/plugin-sdk'
import { Cache } from 'cache-manager'
import { LARK_PLUGIN_CONTEXT } from './tokens'
import {
	ChatLarkContext,
	isLarkCardActionValue,
	LarkCardActionValue,
	LarkMessage,
	TIntegrationLarkOptions,
	TLarkUserProvisionOptions
} from './types'

type LarkClientCacheEntry = {
	integration: IIntegration<TIntegrationLarkOptions>
	client: lark.Client
	bot:
		| {
				app_name: string
				avatar_url: string
				ip_white_list: string[]
				open_id: string
		  }
		| null
}

type LarkRecipient = {
	type: 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email'
	id: string
}

@Injectable()
@ChatChannel('lark')
export class LarkChannelStrategy implements IChatChannel<TIntegrationLarkOptions> {
	private readonly logger = new Logger(LarkChannelStrategy.name)

	@Inject(CACHE_MANAGER)
	private readonly cacheManager: Cache

	private _integrationPermissionService: IntegrationPermissionService
	private _userPermissionService: UserPermissionService

	constructor(
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext,
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(
				INTEGRATION_PERMISSION_SERVICE_TOKEN
			)
		}
		return this._integrationPermissionService
	}

	private get userPermissionService(): UserPermissionService {
		if (!this._userPermissionService) {
			this._userPermissionService = this.pluginContext.resolve(USER_PERMISSION_SERVICE_TOKEN)
		}
		return this._userPermissionService
	}

	/**
	 * Cache of Lark clients by integration ID
	 */
	private clients = new Map<string, LarkClientCacheEntry>()

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
		thread: false,
		media: true,
		textChunkLimit: CHAT_CHANNEL_TEXT_LIMITS['lark'],
		streamingUpdate: true
	}

	private getBotInfoUrl(isLark?: boolean): string {
		return isLark
			? 'https://open.larksuite.com/open-apis/bot/v3/info'
			: 'https://open.feishu.cn/open-apis/bot/v3/info'
	}

	// ==================== Inbound (Receive Messages) ====================

	createEventHandler(
		ctx: TChatEventContext<TIntegrationLarkOptions>,
		handlers: TChatEventHandlers
	): (req: Request, res: Response, next?: NextFunction) => Promise<void> {
		const { integration } = ctx
		const eventHandlers = handlers ?? {}

		const dispatcher = new lark.EventDispatcher({
			verificationToken: integration.options.verificationToken,
			encryptKey: integration.options.encryptKey,
			loggerLevel: lark.LoggerLevel.debug
		})

		dispatcher.register({
			'im.message.receive_v1': async (data) => {
				this.logger.verbose('im.message.receive_v1:', data)

				const message = this.parseInboundMessage(data, ctx)
				if (!message) {
					return true
				}

				// Lark webhook callbacks should return within 3s, so we ack first and process in background.
				this.runBackgroundEventHandler('message', async () => {
					if (message.chatType === 'group') {
						const botInfo = await this.getBotInfo(integration)
						if (this.isBotMentioned(message, botInfo.id)) {
							await eventHandlers.onMention?.(message, ctx)
						}
						return
					}
					await eventHandlers.onMessage?.(message, ctx)
				})

				return true
			},
			'card.action.trigger': async (data: any) => {
				this.logger.verbose('card.action.trigger:', data)

				const action = this.parseCardAction(data, ctx)
				if (action) {
					// Lark webhook callbacks should return within 3s, so we ack first and process in background.
					this.runBackgroundEventHandler('card action', async () => {
						await eventHandlers.onCardAction?.(action, ctx)
					})
				}

				return true
			}
		})

		return lark.adaptExpress(dispatcher, { autoChallenge: true })
	}

	private runBackgroundEventHandler(eventName: string, handler: () => Promise<void>): void {
		void handler().catch((error) => {
			this.logger.error(`Error handling ${eventName}:`, error)
		})
	}

	parseInboundMessage(event: any, _ctx: TChatEventContext<TIntegrationLarkOptions>): TChatInboundMessage | null {
		const { message, sender } = event
		if (!message) {
			return null
		}

		let content = ''
		let contentType: TChatInboundMessage['contentType'] = 'text'

		try {
			const parsed = JSON.parse(message.content)
			content = parsed.text || ''
		} catch {
			content = message.content
		}

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

	parseCardAction(
		event: any,
		_ctx: TChatEventContext<TIntegrationLarkOptions>
	): TChatCardAction<LarkCardActionValue> | null {
		const { action, context, operator } = event
		if (!action || !context) {
			return null
		}
		const value = action.value ?? action.option
		if (!isLarkCardActionValue(value)) {
			this.logger.warn(`Unsupported Lark card action value: ${JSON.stringify(value)}`)
			return null
		}

		return {
			type: action.tag,
			value,
			messageId: context.open_message_id,
			chatId: context.open_chat_id,
			userId: operator?.open_id,
			raw: event
		}
	}

	isBotMentioned(message: TChatInboundMessage, botId: string): boolean {
		return message.mentions?.some((m) => m.id === botId) ?? false
	}

	// ==================== Outbound (Send Messages) ====================

	async sendText(ctx: TChatContext, content: string): Promise<TChatSendResult> {
		try {
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)
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

	async sendMarkdown(ctx: TChatContext, content: string): Promise<TChatSendResult> {
		try {
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)
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

	async sendCard(ctx: TChatContext, card: any): Promise<TChatSendResult> {
		try {
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)
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
			const client = await this.getOrCreateLarkClientById(ctx.integration.id)

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

	async updateMessage(ctx: TChatContext, messageId: string, content: string | any): Promise<TChatSendResult> {
		try {
			const contentStr = typeof content === 'string' ? JSON.stringify({ text: content }) : JSON.stringify(content)
			const result = await this.patchMessage(ctx.integration.id, {
				path: { message_id: messageId },
				data: { content: contentStr }
			})
			if (!result) {
				return { success: false, error: 'Failed to update message' }
			}
			return { success: true, messageId }
		} catch (error: any) {
			this.logger.error('Failed to update message:', error)
			return { success: false, error: error.message }
		}
	}

	// ==================== Core Client Management ====================

	createClient(integration: IIntegration<TIntegrationLarkOptions>): lark.Client {
		return this.createClientFromConfig(integration.options)
	}

	createClientFromConfig(config: TIntegrationLarkOptions): lark.Client {
		return new lark.Client({
			appId: config.appId,
			appSecret: config.appSecret,
			appType: lark.AppType.SelfBuild,
			domain: config.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
			loggerLevel: lark.LoggerLevel.debug
		})
	}

	getOrCreateLarkClient(integration: IIntegration<TIntegrationLarkOptions>): LarkClientCacheEntry {
		let item = this.clients.get(integration.id)
		if (!item || !isEqual(item.integration.updatedAt, integration.updatedAt)) {
			const client = this.createClient(integration)
			item = {
				integration,
				client,
				bot: null
			}
			this.clients.set(integration.id, item)
			this.fetchBotInfo(client, integration.options?.isLark).then((bot) => (item.bot = bot))
		}
		return item
	}

	async getOrCreateLarkClientById(id: string): Promise<lark.Client> {
		const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(id)
		if (!integration) {
			throw new Error(`Integration ${id} not found`)
		}
		return this.getOrCreateLarkClient(integration).client
	}

	getClient(id: string): lark.Client | undefined {
		return this.clients.get(id)?.client
	}

	private async fetchBotInfo(client: lark.Client, isLark?: boolean) {
		const res = await client.request({
			method: 'GET',
			url: this.getBotInfoUrl(isLark),
			data: {},
			params: {}
		})
		return res.bot
	}

	async test(integration: IIntegration<TIntegrationLarkOptions>) {
		const client = this.createClient(integration)
		return await this.fetchBotInfo(client, integration.options?.isLark)
	}

	// ==================== User Management ====================

	async getUser(
		client: lark.Client,
		tenantId: string,
		unionId: string,
		userProvision?: TLarkUserProvisionOptions
	): Promise<IUser | null> {
		if (!tenantId || !unionId) {
			return null
		}

		const larkUserCacheKey = this.getUserByUnionIdCacheKey(tenantId, unionId)
		let user = await this.getUserByCacheOrDatabase(larkUserCacheKey, {
			tenantId,
			thirdPartyId: unionId
		})
		if (user) {
			await this.setUserByIdCache(tenantId, user)
			return user
		}

		if (!this.isAutoProvisionUserEnabled(userProvision)) {
			return null
		}

		const larkUser = await this.safeGetLarkUser(client, unionId)
		try {
			user = await this.userPermissionService.provisionByThirdPartyIdentity<IUser>({
				tenantId,
				thirdPartyId: unionId,
				profile: {
					username: larkUser?.data?.user?.user_id,
					email: larkUser?.data?.user?.email,
					mobile: larkUser?.data?.user?.mobile,
					imageUrl: larkUser?.data?.user?.avatar?.avatar_240,
					firstName: larkUser?.data?.user?.name
				},
				defaults: {
					roleName: this.resolveAutoProvisionRoleName(userProvision)
				}
			})
		} catch (error) {
			this.logger.warn(
				`Failed to auto provision user for tenant "${tenantId}" and unionId "${unionId}": ${getErrorMessage(error)}`
			)
			return null
		}

		if (user) {
			await this.cacheManager.set(larkUserCacheKey, user)
			await this.setUserByIdCache(tenantId, user)
		}

		return user
	}

	async getUserById(tenantId: string, userId: string): Promise<IUser | null> {
		if (!tenantId || !userId) {
			return null
		}

		return this.getUserByCacheOrDatabase(this.getUserByIdCacheKey(tenantId, userId), {
			tenantId,
			id: userId
		})
	}

	async resolveUserByRecipient(integrationId: string, recipient: LarkRecipient): Promise<IUser | null> {
		const recipientType = recipient?.type
		const recipientId = recipient?.id?.trim()
		if (!integrationId || !recipientType || !recipientId) {
			return null
		}
		if (recipientType === 'chat_id') {
			return null
		}

		const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(
			integrationId,
			{ relations: ['tenant'] }
		)
		if (!integration?.tenantId) {
			this.logger.warn(
				`Failed to resolve user by recipient "${recipientType}:${recipientId}": integration "${integrationId}" not found or tenantId missing`
			)
			return null
		}

		const client = this.getOrCreateLarkClient(integration).client
		let unionId: string | null = null
		try {
			switch (recipientType) {
				case 'union_id': {
					unionId = recipientId
					break
				}
				case 'open_id':
				case 'user_id': {
					const response = await client.contact.v3.user.get({
						params: {
							user_id_type: recipientType
						},
						path: {
							user_id: recipientId
						}
					})
					unionId = response?.data?.user?.union_id ?? null
					break
				}
				case 'email': {
					const response = await client.contact.v3.user.batchGetId({
						params: {
							user_id_type: 'union_id'
						},
						data: {
							emails: [recipientId]
						}
					})
					unionId = response?.data?.user_list?.[0]?.user_id ?? null
					break
				}
			}
		} catch (error) {
			this.logger.warn(
				`Failed to resolve recipient "${recipientType}:${recipientId}" from Lark integration "${integrationId}": ${getErrorMessage(error)}`
			)
			return null
		}

		if (!unionId) {
			this.logger.warn(
				`Skip recipient binding for "${recipientType}:${recipientId}" on integration "${integrationId}": union_id not found`
			)
			return null
		}

		return this.getUser(client, integration.tenantId, unionId, integration.options?.userProvision)
	}

	private getUserByUnionIdCacheKey(tenantId: string, unionId: string): string {
		return `lark:user:union:${tenantId}:${unionId}`
	}

	private getUserByIdCacheKey(tenantId: string, userId: string): string {
		return `lark:user:id:${tenantId}:${userId}`
	}

	private async setUserByIdCache(tenantId: string, user: IUser): Promise<void> {
		if (!user?.id) {
			return
		}
		await this.cacheManager.set(this.getUserByIdCacheKey(tenantId, user.id), user)
	}

	private async getUserByCacheOrDatabase(
		cacheKey: string,
		criteria: Record<string, any>
	): Promise<IUser | null> {
		const cached = await this.cacheManager.get<IUser>(cacheKey)
		if (cached) {
			return cached
		}

		const user = await this.userPermissionService.read<IUser>(criteria)
		if (user) {
			await this.cacheManager.set(cacheKey, user)
		}

		return user
	}

	private async safeGetLarkUser(client: lark.Client, unionId: string) {
		try {
			return await client.contact.user.get({
				params: { user_id_type: 'union_id' },
				path: { user_id: unionId }
			})
		} catch {
			return null
		}
	}

	private isAutoProvisionUserEnabled(userProvision?: TLarkUserProvisionOptions): boolean {
		return userProvision?.autoProvision ?? false
	}

	private resolveAutoProvisionRoleName(userProvision?: TLarkUserProvisionOptions): string {
		return userProvision?.roleName || RolesEnum.EMPLOYEE
	}

	// ==================== Legacy Message Helpers ====================

	async createMessage(integrationId: string, message: LarkMessage) {
		try {
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await client.im.message.create(message)
		} catch (err: any) {
			this.logger.error(getErrorMessage(err), err?.stack)
			return null
		}
	}

	async patchMessage(
		integrationId: string,
		payload?: {
			data: { content: string }
			path: { message_id: string }
		}
	) {
		if (!payload) {
			return null
		}
		try {
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await client.im.message.patch(payload)
		} catch (err: any) {
			this.logger.error(err)
			return null
		}
	}

	async deleteMessage(integrationId: string, messageId: string) {
		if (!messageId) {
			return null
		}
		try {
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await (client.im.message as any).delete({
				path: { message_id: messageId }
			})
		} catch (err: any) {
			this.logger.error(err)
			return null
		}
	}

	async errorMessage({ integrationId, chatId }: { integrationId: string; chatId?: string }, err: Error) {
		await this.createMessage(integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: chatId,
				content: JSON.stringify({ text: `Error: ${err.message}` }),
				msg_type: 'text'
			}
		} as LarkMessage)
	}

	async textMessage(context: { integrationId: string; chatId: string; messageId?: string }, content: string) {
		const { chatId, messageId } = context
		if (messageId) {
			return await this.patchMessage(context.integrationId, {
				data: { content: JSON.stringify({ text: content }) },
				path: { message_id: messageId }
			})
		}
		return await this.createMessage(context.integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: chatId,
				content: JSON.stringify({ text: content }),
				msg_type: 'text'
			}
		} as LarkMessage)
	}

	async interactiveMessage(context: ChatLarkContext, data: any) {
		return await this.createMessage(context.integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: context.chatId,
				content: JSON.stringify(data),
				msg_type: 'interactive'
			}
		} as LarkMessage)
	}

	async markdownMessage(context: ChatLarkContext, content: string) {
		await this.createMessage(context.integrationId, {
			params: { receive_id_type: 'chat_id' },
			data: {
				receive_id: context.chatId,
				content: JSON.stringify({
					elements: [{ tag: 'markdown', content }]
				}),
				msg_type: 'interactive'
			}
		} as LarkMessage)
	}

	async patchInteractiveMessage(integrationId: string, messageId: string, data: any) {
		return await this.patchMessage(integrationId, {
			data: { content: JSON.stringify(data) },
			path: { message_id: messageId }
		})
	}

	// ==================== Utility ====================

	private resolveReceiveId(ctx: TChatContext): {
		receiveIdType: 'chat_id' | 'open_id' | 'user_id'
		receiveId: string
	} {
		if (ctx.chatId) {
			return { receiveIdType: 'chat_id', receiveId: ctx.chatId }
		}
		if (ctx.userId) {
			return { receiveIdType: 'open_id', receiveId: ctx.userId }
		}
		this.logger.warn('No chatId or userId provided in context')
		return { receiveIdType: 'chat_id', receiveId: '' }
	}

	async getBotInfo(integration: IIntegration<TIntegrationLarkOptions>): Promise<{
		id: string
		name?: string
		avatar?: string
	}> {
		const item = this.getOrCreateLarkClient(integration)
		if (!item.bot) {
			item.bot = await this.fetchBotInfo(item.client, integration.options?.isLark)
		}
		return {
			id: item.bot?.open_id,
			name: item.bot?.app_name,
			avatar: item.bot?.avatar_url
		}
	}

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

		if (errors.length > 0) {
			return { valid: false, errors }
		}

		try {
			const client = this.createClientFromConfig(config)
			const res = await client.request({
				method: 'GET',
				url: this.getBotInfoUrl(config?.isLark),
				data: {},
				params: {}
			})
			if (!res.bot?.open_id) {
				errors.push('Failed to get bot info from Lark API')
			}
		} catch (error: any) {
			errors.push(`Lark API connection failed: ${error.message}`)
		}

		return {
			valid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined
		}
	}

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
