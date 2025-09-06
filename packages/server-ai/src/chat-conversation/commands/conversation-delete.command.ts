import { IChatConversation } from '@metad/contracts'
import { FindOptionsWhere } from '@metad/server-core'
import { ICommand } from '@nestjs/cqrs'

export class ChatConversationDeleteCommand implements ICommand {
	static readonly type = '[Chat Conversation] Delete'

	constructor(public readonly conditions: FindOptionsWhere<IChatConversation>) {}
}
