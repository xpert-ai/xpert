import { ICommand } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../chat/message'

export class LarkChatXpertCommand implements ICommand {
	static readonly type = '[Lark] Chat with Xpert'

	constructor(
		public readonly xpertId: string,
		public readonly input: string,
		public readonly larkMessage: ChatLarkMessage,
	) {}
}
