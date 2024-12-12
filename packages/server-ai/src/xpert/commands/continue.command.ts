import { TChatOptions, TChatRequest } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class XpertChatContinueCommand implements ICommand {
	static readonly type = '[Xpert] Chat continue'

	constructor(
		public readonly request: TChatRequest,
		public readonly options?: TChatOptions & {
			// Use xpert's draft
			isDraft?: boolean
		}
	) {}
}
