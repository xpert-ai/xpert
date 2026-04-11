import { IChatConversation } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatConversationUpsertCommand implements ICommand {
	static readonly type = '[Chat Conversation] Upsert'

	constructor(
		public readonly entity: Partial<IChatConversation>,
		public readonly relations?: string[]
	) {}
}
