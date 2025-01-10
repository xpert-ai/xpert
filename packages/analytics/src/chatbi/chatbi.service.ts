import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { ChatBIModelService } from '../chatbi-model/chatbi-model.service'
import { ChatBIUserSession } from './types'

/**
 * @deprecated Use ChatBI toolset
 */
@Injectable()
export class ChatBIService {
	private readonly logger = new Logger(ChatBIService.name)

	readonly userSessions: Record<string, ChatBIUserSession> = {}

	constructor(
		private readonly modelService: ChatBIModelService,
		@Inject(CACHE_MANAGER)
		public readonly cacheManager: Cache,
	) {}

	async upsertUserSession(userId: string, value: Partial<ChatBIUserSession>) {
		const chatModel = await this.modelService.findOneByConditions({
			tenantId: value.tenantId,
			organizationId: value.organizationId,
			id: value.chatModelId
		})
		const session = this.userSessions[userId]
		// if (session && session.chatModelId !== value.chatModelId) {
		// 	// Clear user's conversation context
		// 	for (const key of this.userConversations.keys()) {
		// 		if (key.startsWith(userId)) {
		// 			this.userConversations.get(userId).context = null
		// 		}
		// 	}
		// }
		this.userSessions[userId] = {
			...(session ?? {}),
			...value
		} as ChatBIUserSession
		return chatModel
	}
}
