import { ICommand } from '@nestjs/cqrs'

const COMMAND_METADATA = '__command__'

export class CancelConversationCommand implements ICommand {
	static readonly type = '[Chat Conversation] Cancel'

	constructor(
		public readonly input: {
			conversationId?: string
			threadId?: string
			executionId?: string
		}
	) {}
}

Reflect.defineMetadata(COMMAND_METADATA, { id: CancelConversationCommand.type }, CancelConversationCommand)