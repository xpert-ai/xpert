import { IChatConversation } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatConversationUpsertCommand implements ICommand {
	static readonly type = '[Chat Conversation] Upsert'

	constructor(
		public readonly entity: Partial<IChatConversation>,
		public readonly relations?: string[]
	) {}
}
