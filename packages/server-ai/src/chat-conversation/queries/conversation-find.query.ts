import { IChatConversation } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

export class FindChatConversationQuery implements IQuery {
	static readonly type = '[Chat Conversation] Find One'

	constructor(
		public readonly conditions: FindConditions<IChatConversation>,
		public readonly relations?: string[]
	) {}
}
