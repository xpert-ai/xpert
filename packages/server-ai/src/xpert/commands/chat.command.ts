import { TChatOptions, TChatRequest } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class XpertChatCommand implements ICommand {
	static readonly type = '[Xpert] Chat'

	constructor(
		public readonly request: TChatRequest,
		public readonly options?: TChatOptions & {
			// Use xpert's draft
			isDraft?: boolean
			fromEndUserId?: string
		}
	) {}
}
