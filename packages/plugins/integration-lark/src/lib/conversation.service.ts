import { mapTranslationLanguage, TIntegrationLarkOptions } from '@metad/contracts'
import { RequestContext, runWithRequestContext, TChatInboundMessage, TChatCardAction, TChatEventContext } from '@xpert-ai/plugin-sdk'
import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import Bull from 'bull'
import { Queue } from 'bull'
import type { Observable } from 'rxjs'
import { ChatLarkMessage } from './chat/message'
import { LarkMessageCommand } from './commands'
import { LarkChatXpertCommand } from './commands/chat-xpert.command'
import { LarkService } from './lark.service'
import { ChatLarkContext, isConfirmAction, isEndAction, isRejectAction } from './types'

@Injectable()
export class LarkConversationService implements OnModuleDestroy {
	private readonly logger = new Logger(LarkConversationService.name)

	public static readonly prefix = 'lark:chat'

	private userQueues: Map<string, Queue> = new Map()

	constructor(
		private readonly commandBus: CommandBus,
		@Inject(forwardRef(() => LarkService))
		private readonly larkService: LarkService,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	// private getRedisOptions(): Redis.RedisOptions {
	// 	const config = this.core.config
	// 	const port = Number(config.get('REDIS_PORT') ?? 6379)
	// 	return {
	// 		host: config.get('REDIS_HOST') || 'localhost',
	// 		port: Number.isNaN(port) ? 6379 : port,
	// 		username: config.get('REDIS.USERNAME') || config.get('REDIS_USERNAME') || '',
	// 		password: config.get('REDIS_PASSWORD') || ''
	// 	}
	// }

	async getConversation(userId: string, xpertId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		return await this.cacheManager.get<string>(key)
	}

	async setConversation(userId: string, xpertId: string, conversationId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		await this.cacheManager.set(key, conversationId, 60 * 10 * 1000) // 10 min conversation live
		await this.cacheManager.get<string>(key)
	}

	async ask(xpertId: string, content: string, message: ChatLarkMessage) {
		await this.commandBus.execute(new LarkChatXpertCommand(xpertId, content, message))
	}

	/**
	 * Get last message of user's conversation.
	 *
	 * @param userId
	 * @param xpertId
	 * @returns
	 */
	async getLastMessage(userId: string, xpertId: string) {
		const id = await this.getConversation(userId, xpertId)
		if (id) {
			// const conversation = await this.core.chat.getChatConversation(id, ['messages'])
			// return conversation?.messages?.slice(-1)[0] ?? null
		}
		return null
	}

	async onAction(action: string, chatContext: ChatLarkContext, userId: string, xpertId: string) {
		const id = await this.getConversation(userId, xpertId)

		if (!id) {
			const { integrationId, chatId } = chatContext

			return this.larkService.errorMessage(
				{ integrationId, chatId },
				new Error(
					await this.larkService.translate('integration.Lark.ActionSessionTimedOut', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
			)
		}

		const lastMessage = await this.getLastMessage(userId, xpertId)

		const prevMessage = new ChatLarkMessage(
			{ ...chatContext, larkService: this.larkService },
			{ ...(lastMessage?.thirdPartyMessage ?? {}), messageId: lastMessage.id } as any
		)

		const newMessage = new ChatLarkMessage(
			{ ...chatContext, larkService: this.larkService },
			{
				language: lastMessage?.thirdPartyMessage?.language
			} as any
		)

		if (isEndAction(action)) {
			await prevMessage.end()
			await this.cacheManager.del(LarkConversationService.prefix + `:${userId}:${xpertId}`)
		} else if (isConfirmAction(action)) {
			await prevMessage.done()
			await this.commandBus.execute(
				new LarkChatXpertCommand(xpertId, null, newMessage, {
					confirm: true
				})
			)
		} else if (isRejectAction(action)) {
			await prevMessage.done()
			await this.commandBus.execute(
				new LarkChatXpertCommand(xpertId, null, newMessage, {
					reject: true
				})
			)
		} else {
			const user = RequestContext.currentUser()
			const userQueue = await this.getUserQueue(user.id)
			// Adding task to user's queue
			await userQueue.add({
				...chatContext,
				input: action
			})
		}
	}

	/**
	 * Get or create user queue
	 *
	 * @param userId
	 * @returns
	 */
	async getUserQueue(userId: string): Promise<Bull.Queue> {
		if (!this.userQueues.has(userId)) {
			const queue = new Bull(`lark:user:${userId}`, {
				// redis: this.getRedisOptions()
			})

			/**
			 * Bind processing logic, maximum concurrency is one
			 */
			queue.process(1, async (job) => {
				// const user = await this.core.user.findById(job.data.userId, { relations: ['role'] })
				// if (!user) {
				// 	this.logger.warn(`User ${job.data.userId} not found, skip job ${job.id}`)
				// 	return
				// }

				runWithRequestContext(
					{ user: null, headers: { ['organization-id']: job.data.organizationId } },
					{},
					async () => {
						try {
							await this.commandBus.execute<LarkMessageCommand, Observable<any>>(
								new LarkMessageCommand(job.data)
							)
							return `Processed message: ${job.id}`
						} catch (err) {
							this.logger.error(err)
						}
					}
				)
			})

			// completed event
			queue.on('completed', (job) => {
				console.log(`Job ${job.id} for user ${userId} completed.`)
			})

			// failed event
			queue.on('failed', (job, error) => {
				console.error(`Job ${job.id} for user ${userId} failed:`, error.message)
			})

			// Save user's queue
			this.userQueues.set(userId, queue)
		}

		return this.userQueues.get(userId)
	}

	/**
	 * Handle inbound message from IChatChannel
	 *
	 * This method is called by LarkHooksController when a message is received via webhook.
	 * It creates a job in the user's queue for processing.
	 *
	 * @param message - Parsed inbound message
	 * @param ctx - Event context containing integration info
	 */
	async handleMessage(message: TChatInboundMessage, ctx: TChatEventContext<TIntegrationLarkOptions>): Promise<void> {
		const user = RequestContext.currentUser()
		if (!user) {
			this.logger.warn('No user in request context, cannot handle message')
			return
		}

		const userQueue = await this.getUserQueue(user.id)

		// Add task to user's queue
		await userQueue.add({
			tenant: ctx.integration.tenant,
			organizationId: ctx.organizationId,
			integrationId: ctx.integration.id,
			userId: user.id,
			message: message.raw,
			chatId: message.chatId,
			chatType: message.chatType,
			senderOpenId: message.senderId // Lark sender's open_id
		})
	}

	/**
	 * Handle card action from IChatChannel
	 *
	 * This method is called by LarkHooksController when a card button is clicked.
	 *
	 * @param action - Parsed card action
	 * @param ctx - Event context containing integration info
	 */
	async handleCardAction(action: TChatCardAction, ctx: TChatEventContext<TIntegrationLarkOptions>): Promise<void> {
		const { xpertId } = ctx.integration.options ?? {}
		if (!xpertId) {
			this.logger.warn('No xpertId configured for integration')
			return
		}

		const user = RequestContext.currentUser()
		if (!user) {
			this.logger.warn('No user in request context, cannot handle card action')
			return
		}

		await this.onAction(
			action.value,
			{
				tenant: ctx.integration.tenant,
				organizationId: ctx.organizationId,
				integrationId: ctx.integration.id,
				userId: user.id,
				chatId: action.chatId
			} as ChatLarkContext,
			user.id,
			xpertId
		)
	}

	async onModuleDestroy() {
		for (const queue of this.userQueues.values()) {
			await queue.close()
		}
	}
}
