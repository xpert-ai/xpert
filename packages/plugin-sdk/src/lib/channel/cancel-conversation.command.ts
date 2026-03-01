import { ICommand } from '@nestjs/cqrs'

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
