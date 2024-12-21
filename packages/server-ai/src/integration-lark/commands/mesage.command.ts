import { ICommand } from '@nestjs/cqrs'
import { ChatLarkContext, TLarkEvent } from '../types'

export class LarkMessageCommand implements ICommand {
	static readonly type = '[Lark] Message'

	constructor(
		public readonly input: ChatLarkContext<TLarkEvent>
	) {}
}
