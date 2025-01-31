import { IXpert, IXpertAgentExecution, TChatOptions } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

/**
 * Create graph for agent
 */
export class XpertAgentSubgraphCommand implements ICommand {
	static readonly type = '[Xpert Agent] Subgraph'

	constructor(
		public readonly agentKey: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			isStart: boolean
			/**
			 * Agent key who calls me
			 */
			leaderKey?: string
			// The id of root agent execution
			rootExecutionId?: string
			// Langgraph thread id
			thread_id?: string
			execution?: IXpertAgentExecution
			// Use xpert's draft
			isDraft?: boolean
			// The subscriber response to client
			subscriber?: Subscriber<MessageEvent>
			abortController?: AbortController
		}
	) {}
}
