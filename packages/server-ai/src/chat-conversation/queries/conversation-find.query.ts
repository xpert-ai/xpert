import { IChatConversation } from '@xpert-ai/contracts'
import { FindOptionsWhere, PaginationParams } from '@xpert-ai/server-core'
import { IQuery } from '@nestjs/cqrs'
import { ChatConversation } from '../conversation.entity'

/**
 * Find chat conversations by conditions
 */
export class FindChatConversationQuery implements IQuery {
	static readonly type = '[Chat Conversation] Find all'

	constructor(
		public readonly conditions: FindOptionsWhere<IChatConversation>,
		public readonly options?: Partial<PaginationParams<ChatConversation>>
	) {}
}
