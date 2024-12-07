import { IChatConversation } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

/**
 * Find chat conversations by conditions
 */
export class FindChatConversationQuery implements IQuery {
	static readonly type = '[Chat Conversation] Find all'

	constructor(
		public readonly conditions: FindConditions<IChatConversation>,
		public readonly relations?: string[]
	) {}
}
