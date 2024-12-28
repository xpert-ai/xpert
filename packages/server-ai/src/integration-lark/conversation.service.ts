import { IChatConversation } from '@metad/contracts'
import { CACHE_MANAGER, Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { GetChatConversationQuery } from '../chat-conversation'
import { ChatLarkMessage } from './chat/message'
import { LarkChatXpertCommand } from './commands/chat-xpert.command'
import { LarkService } from './lark.service'
import { ChatLarkContext } from './types'

@Injectable()
export class LarkConversationService {
	readonly #logger = new Logger(LarkConversationService.name)

	public readonly prefix = 'chat'

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache,
		@Inject(forwardRef(() => LarkService))
		private readonly larkService: LarkService,
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
				const message = new ChatLarkMessage(chatContext, {...lastMessage.thirdPartyMessage, messageId: lastMessage.id } as any, this)
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
}
