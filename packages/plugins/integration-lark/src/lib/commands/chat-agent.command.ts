import { ICommand } from '@nestjs/cqrs'
import { ChatLarkContext, TLarkEvent } from '../types'

export class LarkChatAgentCommand implements ICommand {
	static readonly type = '[Lark] Chat with agent'

	constructor(public readonly input: ChatLarkContext<TLarkEvent>) {}
}
