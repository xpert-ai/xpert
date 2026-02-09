import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration, IUser, TIntegrationLarkOptions, TranslateOptions } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { isEqual } from 'date-fns'
import { ChatLarkContext, LarkMessage } from './types'
import { LarkCoreApi } from './lark-core-api.service'

type LarkConfig = {
  roleName?: string
}

/**
 * Lark Service
 *
 * Low-level service for Lark API operations.
 * Provides client management and basic message operations.
 *
 * For high-level chat channel operations, use LarkChannelStrategy instead.
 */
@Injectable()
export class LarkService {
	private readonly logger = new Logger(LarkService.name)

	/**
	 * Cache of Lark clients by integration ID
	 */
	private clients = new Map<
		string,
		{
			integration: IIntegration
			client: lark.Client
			bot: {
				app_name: string
				avatar_url: string
				ip_white_list: string[]
				open_id: string
			}
		}
	>()

	constructor(private readonly core: LarkCoreApi) {}

	// ==================== Core Client Management ====================

	/**
	 * Create a Lark client for the given integration
	 *
	 * @param integration - Integration configuration
	 * @returns Lark client instance
	 */
	createClient(integration: IIntegration<TIntegrationLarkOptions>): lark.Client {
		return new lark.Client({
			appId: integration.options.appId,
			appSecret: integration.options.appSecret,
			appType: lark.AppType.SelfBuild,
			domain: integration.options.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
			loggerLevel: lark.LoggerLevel.debug
		})
	}

	/**
	 * Get or create a cached Lark client for the given integration
	 *
	 * @param integration - Integration configuration
	 * @returns Cached client entry with bot info
	 */
	getOrCreateLarkClient(integration: IIntegration) {
		let item = this.clients.get(integration.id)
		if (!item || !isEqual(item.integration.updatedAt, integration.updatedAt)) {
			const client = this.createClient(integration)
			item = {
				integration,
				client,
				bot: null
			}
			this.clients.set(integration.id, item)
			this.getBotInfo(client).then((bot) => (item.bot = bot))
		}
		return item
	}

	/**
	 * Get or create a Lark client by integration ID
	 *
	 * @param id - Integration ID
	 * @returns Lark client instance
	 */
	async getOrCreateLarkClientById(id: string): Promise<lark.Client> {
		const integration = await this.core.integration.findById(id)
		if (!integration) {
			throw new Error(`Integration ${id} not found`)
		}
		return this.getOrCreateLarkClient(integration).client
	}

	/**
	 * Get cached client by integration ID
	 *
	 * @param id - Integration ID
	 * @returns Lark client or undefined
	 */
	getClient(id: string): lark.Client | undefined {
		return this.clients.get(id)?.client
	}

	/**
	 * Get bot info from Lark API
	 *
	 * @param client - Lark client
	 * @returns Bot information
	 */
	async getBotInfo(client: lark.Client) {
		const res = await client.request({
			method: 'GET',
			url: 'https://open.feishu.cn/open-apis/bot/v3/info',
			data: {},
			params: {}
		})
		return res.bot
	}

	/**
	 * Test connection to Lark
	 *
	 * @param integration - Integration to test
	 * @returns Bot info if successful
	 */
	async test(integration: IIntegration) {
		const client = this.createClient(integration)
		return await this.getBotInfo(client)
	}

	// ==================== User Management ====================

	/**
	 * Get or create user from Lark identity
	 *
	 * @param client - Lark client
	 * @param tenantId - Tenant ID
	 * @param unionId - Lark union ID
	 * @returns User entity
	 */
	async getUser(client: lark.Client, tenantId: string, unionId: string): Promise<IUser> {
		const larkUserCacheKey = `lark:user:${tenantId}:${unionId}`

		// From cache
		let user = await this.core.cache.get<IUser>(larkUserCacheKey)
		if (user) {
			return user
		}

		try {
			user = await this.core.user.findOneBy?.({
				tenantId,
				thirdPartyId: unionId
			})
		} catch (err) {
			// User not found
		}

		if (!user) {
			// Try to get user info from Lark (may fail for external users)
			let larkUser = null
			try {
				larkUser = await client.contact.user.get({
					params: { user_id_type: 'union_id' },
					path: { user_id: unionId }
				})
			} catch (err) {
				// External user or no permission
			}

			// Get Lark user role
			const larkConfig = this.core.config.get('larkConfig') as LarkConfig | undefined
			const roleName = larkConfig?.roleName
			if (!roleName) {
				throw new Error('Lark roleName is not configured')
			}
			const role = await this.core.role.findByName(tenantId, roleName)
			if (!role) {
				throw new Error(`Role ${roleName} not found`)
			}

			if (!this.core.user.create) {
				throw new Error('User create API is not available')
			}

			user = await this.core.user.create({
				tenantId,
				thirdPartyId: unionId,
				username: larkUser?.data.user.user_id,
				email: larkUser?.data.user.email,
				mobile: larkUser?.data.user.mobile,
				imageUrl: larkUser?.data.user.avatar?.avatar_240,
				firstName: larkUser?.data.user.name,
				roleId: role.id
			})
		}

		if (user) {
			await this.core.cache.set(larkUserCacheKey, user)
		}

		return user
	}

	// ==================== Message Operations (Legacy - used by ChatLarkMessage) ====================

	/**
	 * Create a message via Lark API
	 *
	 * @param integrationId - Integration ID
	 * @param message - Message payload
	 * @returns Message creation result
	 */
	async createMessage(integrationId: string, message: LarkMessage) {
		try {
			const client = await this.getOrCreateLarkClientById(integrationId)
			return await client.im.message.create(message)
		} catch (err) {
			this.logger.error(err)
		}
	}

	/**
	 * Patch/update a message via Lark API
	 *
	 * @param integrationId - Integration ID
	 * @param payload - Patch payload
	 * @returns Patch result
	 */
	async patchMessage(
		integrationId: string,
		payload?: {
			data: { content: string }
			path: { message_id: string }
		}
	) {
		try {
			return await this.getClient(integrationId)?.im.message.patch(payload)
		} catch (err) {
			this.logger.error(err)
		}
	}

	/**
	 * Send error message to chat
	 *
	 * @param context - Chat context
	 * @param err - Error to send
	 */
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

	/**
	 * Send text message (with optional update support)
	 *
	 * @param context - Chat context
	 * @param content - Text content
	 * @returns Message result
	 */
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

	/**
	 * Send interactive card message
	 *
	 * @param context - Chat context
	 * @param data - Card data
	 * @returns Message result
	 */
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

	/**
	 * Send markdown message (via interactive card)
	 *
	 * @param context - Chat context
	 * @param content - Markdown content
	 */
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

	/**
	 * Update interactive card message
	 *
	 * @param integrationId - Integration ID
	 * @param messageId - Message ID to update
	 * @param data - New card data
	 * @returns Patch result
	 */
	async patchInteractiveMessage(integrationId: string, messageId: string, data: any) {
		return await this.patchMessage(integrationId, {
			data: { content: JSON.stringify(data) },
			path: { message_id: messageId }
		})
	}

	// ==================== Utility ====================

	/**
	 * Translate i18n key
	 *
	 * @param key - Translation key
	 * @param options - Translation options
	 * @returns Translated string
	 */
	async translate(key: string, options: TranslateOptions) {
		return this.core.i18n.t(key, options)
	}
}
