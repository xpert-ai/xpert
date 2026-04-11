import { TChatOptions, TChatRequest } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'

export class XpertChatCommand extends Command<Observable<MessageEvent>> {
	static readonly type = '[Xpert] Chat'

	constructor(
		public readonly request: TChatRequest,
		public readonly options?: TChatOptions & {
			xpertId?: string
			// Use xpert's draft
			isDraft?: boolean
			fromEndUserId?: string
			execution?: {id: string}
		}
	) {
		super()
	}
}
