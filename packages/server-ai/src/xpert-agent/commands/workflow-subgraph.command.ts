import { CompiledStateGraph } from '@langchain/langgraph'
import { IXpert, IXpertAgentExecution, TChatOptions, TXpertGraph, TXpertParameter } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { TAgentSubgraphParams } from '../agent'

/**
 * Create a subgraph (langgraph) from a workflow perspective: workflow nodes and agent nodes.
 */
export class XpertWorkflowSubgraphCommand extends Command<{ graph: CompiledStateGraph<any, any, any> }> {
	static readonly type = '[Xpert Agent] Workflow Subgraph'

	constructor(
		public readonly xpert: Partial<IXpert>,
		public readonly graph: TXpertGraph,
		public readonly subGraph: TXpertGraph,
		public readonly options: TChatOptions & TAgentSubgraphParams & {
			rootController: AbortController
			signal: AbortSignal
			disableCheckpointer?: boolean
			variables?: TXpertParameter[]
			startNodes?: string[]
			execution: IXpertAgentExecution
		}
	) {
		super()
	}
}
