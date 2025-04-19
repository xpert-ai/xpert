import { IChatConversation } from '@metad/contracts'
import { REDIS_OPTIONS, RequestContext, runWithRequestContext, UserService } from '@metad/server-core'
import { CACHE_MANAGER, forwardRef, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import Bull from 'bull'
import { Queue } from 'bull'
import { Cache } from 'cache-manager'
import * as Redis from 'ioredis'
import { Observable } from 'rxjs'
import { GetChatConversationQuery } from '../chat-conversation'
import { ChatLarkMessage } from './chat/message'
import { LarkMessageCommand } from './commands'
import { LarkChatXpertCommand } from './commands/chat-xpert.command'
import { LarkService } from './lark.service'
import { ChatLarkContext, isConfirmAction, isEndAction, isRejectAction } from './types'

@Injectable()
export class LarkConversationService implements OnModuleDestroy {
	readonly #logger = new Logger(LarkConversationService.name)

	public static readonly prefix = 'chat'

	private userQueues: Map<string, Queue> = new Map()

	constructor(
		private readonly userService: UserService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		@Inject(forwardRef(() => LarkService))
		private readonly larkService: LarkService,
		@Inject(REDIS_OPTIONS)
		private readonly redisOptions: Redis.RedisOptions
	) {}

	async getConversation(userId: string, xpertId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		return await this.cacheManager.get<string>(key)
	}

	async setConversation(userId: string, xpertId: string, conversationId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		await this.cacheManager.set(key, conversationId, { ttl: 60 * 10 })
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
			const conversation = await this.queryBus.execute<GetChatConversationQuery, IChatConversation>(
				new GetChatConversationQuery({ id }, ['messages'])
			)
			return conversation.messages.slice(-1)[0]
		}
		return null
	}

	async onAction(action: string, chatContext: ChatLarkContext, userId: string, xpertId: string) {
		const id = await this.getConversation(userId, xpertId)

		if (!id) {
			const {integrationId, chatId} = chatContext

			return this.larkService.errorMessage(
				{ integrationId, chatId },
				new Error(await this.larkService.translate('integration.Lark.ActionSessionTimedOut', {}))
			)
		}

		const lastMessage = await this.getLastMessage(userId, xpertId)

		const prevMessage = new ChatLarkMessage(
			{ ...chatContext, larkService: this.larkService },
			{ ...(lastMessage?.thirdPartyMessage ?? {}), messageId: lastMessage.id } as any,
		)

		const newMessage = new ChatLarkMessage(
			{ ...chatContext, larkService: this.larkService },
			{
				language: lastMessage?.thirdPartyMessage?.language
			} as any,
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
				input: action,
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
			const queue = new Bull(`user-${userId}`, {
				redis: this.redisOptions
			})

			/**
			 * Bind processing logic, maximum concurrency is one
			 */
			queue.process(1, async (job) => {
				const user = await this.userService.findOne(job.data.userId, {relations: ['role']})

				runWithRequestContext(
					{ user, headers: { ['organization-id']: job.data.organizationId } }, async () => {
					try {
						await this.commandBus.execute<LarkMessageCommand, Observable<any>>(new LarkMessageCommand(job.data))
						return `Processed message: ${job.id}`
					} catch(err) {
						this.#logger.error(err)
					}
				})
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

	async onModuleDestroy() {
		for (const queue of this.userQueues.values()) {
			await queue.close()
		}
	}
}
