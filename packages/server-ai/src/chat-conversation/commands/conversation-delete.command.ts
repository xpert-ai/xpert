import { IChatConversation } from '@xpert-ai/contracts'
import { FindOptionsWhere } from '@xpert-ai/server-core'
import { ICommand } from '@nestjs/cqrs'

export class ChatConversationDeleteCommand implements ICommand {
	static readonly type = '[Chat Conversation] Delete'

	constructor(public readonly conditions: FindOptionsWhere<IChatConversation>) {}
}
