import { IChatConversation } from '@metad/contracts'
import { FindOptionsWhere, PaginationParams } from '@metad/server-core'
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
