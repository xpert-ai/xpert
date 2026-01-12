import { IXpert, TChatOptions, TXpertGraph, TXpertParameter } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { TAgentSubgraphParams } from '../agent'

export class XpertWorkflowSubgraphCommand implements ICommand {
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
		}
	) {}
}
