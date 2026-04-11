import { IXpert, IXpertAgentExecution } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

export class XpertExecuteCommand implements ICommand {
	static readonly type = '[Xpert] Execute'

	constructor(
		public readonly input: string,
		public readonly xpert: IXpert,
		public readonly options?: {
			// The id of root agent execution
			rootExecutionId?: string
			// Langgraph thread id
			thread_id?: string
			// Use xpert's draft
			isDraft?: boolean
			// The instance of current agent execution
			execution?: IXpertAgentExecution
			// The subscriber response to client
			subscriber?: Subscriber<MessageEvent>
		}
	) {}
}
