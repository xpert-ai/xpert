import { IChatConversation } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

/**
 * Find one chat conversation by conditions, not raise exception when not found
 */
export class GetChatConversationQuery implements IQuery {
	static readonly type = '[Chat Conversation] Find One'

	constructor(
		public readonly conditions: FindConditions<IChatConversation>,
		public readonly relations?: string[]
	) {}
}
