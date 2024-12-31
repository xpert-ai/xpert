import { IChatConversation } from '@metad/contracts'
import { REDIS_OPTIONS } from '@metad/server-core'
import { CACHE_MANAGER, forwardRef, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import * as Bull from 'bull'
import { Queue } from 'bull'
import { Cache } from 'cache-manager'
import * as Redis from 'ioredis'
import { Observable } from 'rxjs'
import { GetChatConversationQuery } from '../chat-conversation'
import { ChatLarkMessage } from './chat/message'
import { LarkMessageCommand } from './commands'
import { LarkChatXpertCommand } from './commands/chat-xpert.command'
import { LarkService } from './lark.service'
import { ChatLarkContext } from './types'

@Injectable()
export class LarkConversationService implements OnModuleDestroy {
	readonly #logger = new Logger(LarkConversationService.name)

	public readonly prefix = 'chat'

	private userQueues: Map<string, Queue> = new Map()

	constructor(
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
		return await this.cacheManager.get<string>(this.prefix + `/${userId}/${xpertId}`)
	}

	async setConversation(userId: string, xpertId: string, conversationId: string) {
		return await this.cacheManager.set(this.prefix + `/${userId}/${xpertId}`, conversationId)
	}

	async endConversation(chatContext: ChatLarkContext, userId: string, xpertId: string) {
		const id = await this.getConversation(userId, xpertId)
		if (id) {
			const conversation = await this.queryBus.execute<GetChatConversationQuery, IChatConversation>(
				new GetChatConversationQuery({ id }, ['messages'])
			)
			const lastMessage = conversation.messages.slice(-1)[0]
			if (lastMessage?.thirdPartyMessage) {
				const message = new ChatLarkMessage(
					{ ...chatContext, larkService: this.larkService },
					{ ...lastMessage.thirdPartyMessage, messageId: lastMessage.id } as any,
					this
				)
				await message.update({ status: 'end' })
			}
			await this.cacheManager.del(this.prefix + `/${userId}/${xpertId}`)
		}
	}

	async ask(xpertId: string, content: string, message: ChatLarkMessage) {
		await this.commandBus.execute(new LarkChatXpertCommand(xpertId, content, message))
	}

	async confirm(xpertId: string, message: ChatLarkMessage) {
		await this.commandBus.execute(
			new LarkChatXpertCommand(xpertId, null, message, {
				confirm: true
			})
		)
	}

	async reject(xpertId: string, message: ChatLarkMessage) {
		await this.commandBus.execute(
			new LarkChatXpertCommand(xpertId, null, message, {
				reject: true
			})
		)
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
				console.log(`Processing job for user ${userId}:`, job.data)

				await this.commandBus.execute<LarkMessageCommand, Observable<any>>(new LarkMessageCommand(job.data))

				return `Processed message: ${job.data.message}`
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
