import { TChatOptions, TChatRequest } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'

export class XpertChatCommand extends Command<Observable<MessageEvent>> {
	static readonly type = '[Xpert] Chat'

	constructor(
		public readonly request: TChatRequest,
		public readonly options?: TChatOptions & {
			// Use xpert's draft
			isDraft?: boolean
			fromEndUserId?: string
			execution?: {id: string}
		}
	) {
		super()
	}
}
