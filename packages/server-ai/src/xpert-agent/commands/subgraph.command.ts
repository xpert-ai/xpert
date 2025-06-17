import { DynamicStructuredTool } from '@langchain/core/tools'
import { IXpert, IXpertAgentExecution, TChatOptions, TXpertParameter } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

/**
 * Create ReAct graph for agent
 */
export class XpertAgentSubgraphCommand implements ICommand {
	static readonly type = '[Xpert Agent] Subgraph'

	constructor(
		public readonly agentKeyOrName: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			/**
			 * Is a subflow enter point
			 */
			isStart: boolean
			/**
			 * Agent key who calls me
			 */
			leaderKey?: string
			/**
			 * @deprecated use executionId in configurable
			 */
			rootExecutionId?: string
			execution?: IXpertAgentExecution
			// Langgraph thread id
			thread_id?: string
			// Use xpert's draft
			isDraft?: boolean
			// The subscriber response to client
			subscriber?: Subscriber<MessageEvent>
			/**
			 * Control the entire graph
			 */
			rootController: AbortController
			signal: AbortSignal
			disableCheckpointer?: boolean
			/**
			 * Temporary parameters (state variables)
			 * @deprecated Is it still useful?
			 */
			variables?: TXpertParameter[]
			channel: string
			partners?: string[]
			handoffTools?: DynamicStructuredTool[]
		}
	) {}
}
