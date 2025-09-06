import { IChatConversation } from '@metad/contracts'
import { FindOptionsWhere } from '@metad/server-core'
import { IQuery } from '@nestjs/cqrs'

/**
 * Find one chat conversation by conditions, not raise exception when not found
 */
export class GetChatConversationQuery implements IQuery {
	static readonly type = '[Chat Conversation] Find One'

	constructor(
		public readonly conditions: FindOptionsWhere<IChatConversation>,
		public readonly relations?: string[]
	) {}
}
