import { IXpertAgentExecution } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'
import type { components } from '../schemas/agent-protocol-schema'

/**
 */
export class RunCreateStreamCommand extends Command<{
	execution: IXpertAgentExecution
	stream: Observable<MessageEvent>
}> {
	static readonly type = '[Agent Protocol] Create run stream'

	constructor(
		public readonly threadId: string,
		public readonly runCreate: components['schemas']['RunCreateStateful']
	) {
		super()
	}
}
