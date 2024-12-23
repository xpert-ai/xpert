import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { LarkChatXpertCommand } from './commands/chat-xpert.command'
import { ChatLarkMessage } from './chat/message'

@Injectable()
export class LarkConversationService {
	readonly #logger = new Logger(LarkConversationService.name)

	constructor(
		private readonly commandBus: CommandBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	async getConversation(userId: string, xpertId: string) {
		return await this.cacheManager.get<string>(`Chat/${userId}/${xpertId}`)
	}

	async setConversation(userId: string, xpertId: string, conversationId: string) {
		return await this.cacheManager.set(`Chat/${userId}/${xpertId}`, conversationId)
	}

	async endConversation(userId: string, xpertId: string) {
		await this.cacheManager.del(`Chat/${userId}/${xpertId}`)
	}

	async ask(xpertId: string, content: string, message: ChatLarkMessage) {
		await this.commandBus.execute(new LarkChatXpertCommand(xpertId, content, message))
	}
}
