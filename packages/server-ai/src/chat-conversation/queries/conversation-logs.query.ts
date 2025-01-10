import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'
import { ChatConversation } from '../conversation.entity'

/**
 * Query chat conversation logs
 */
export class ChatConversationLogsQuery implements IQuery {
	static readonly type = '[Chat Conversation] Find conversation logs'

	constructor(
		public readonly options: FindManyOptions<ChatConversation>,
	) {}
}
