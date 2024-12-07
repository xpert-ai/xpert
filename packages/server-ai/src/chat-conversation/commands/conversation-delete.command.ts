import { IChatConversation } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

export class ChatConversationDeleteCommand implements ICommand {
	static readonly type = '[Chat Conversation] Delete'

	constructor(public readonly conditions: FindConditions<IChatConversation>) {}
}
