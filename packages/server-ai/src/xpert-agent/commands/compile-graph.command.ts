import { IXpert, IXpertAgentExecution, TChatOptions } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import { TAgentSubgraphParams } from '../agent'

/**
 * Compile graph for agent
 */
export class CompileGraphCommand implements ICommand {
	static readonly type = '[Xpert Agent] Compile graph'

	constructor(
		public readonly agentKeyOrName: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & TAgentSubgraphParams & {
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
			subscriber: Subscriber<MessageEvent>
			/**
			 * Control the entire graph
			 */
			rootController: AbortController
			signal: AbortSignal
		}
	) {}
}
