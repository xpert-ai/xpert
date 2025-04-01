import { IXpert, IXpertAgentExecution, TChatOptions } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

/**
 * Create swarm for agents
 */
export class XpertAgentSwarmCommand implements ICommand {
	static readonly type = '[Xpert Agent] Swarm'

	constructor(
		public readonly agentKeyOrName: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			// The id of root agent execution
			rootExecutionId?: string
			// Langgraph thread id
			thread_id?: string
			execution?: IXpertAgentExecution
			// Use xpert's draft
			isDraft?: boolean
			// The subscriber response to client
			subscriber?: Subscriber<MessageEvent>
			/**
			 * Control the entire graph
			 */
			rootController: AbortController
			signal: AbortSignal

			partners: string[]
		}
	) {}
}
