import { IChatConversation } from '@xpert-ai/contracts'
import { FindOptionsWhere } from '@xpert-ai/server-core'
import { Query } from '@nestjs/cqrs'
import { ChatConversation } from '../conversation.entity'

/**
 * Find one chat conversation by conditions, not raise exception when not found
 */
export class GetChatConversationQuery extends Query<ChatConversation> {
	static readonly type = '[Chat Conversation] Find One'

	constructor(
		public readonly conditions: FindOptionsWhere<IChatConversation>,
		public readonly relations?: string[]
	) {
		super()
	}
}
