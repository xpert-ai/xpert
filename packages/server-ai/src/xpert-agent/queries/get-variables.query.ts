import { TWorkflowVarGroup } from '@metad/contracts'
import { Query } from '@nestjs/cqrs'

/**
 * Get state variables definations of xpert agent or workflow node.
 */
export class XpertAgentVariablesQuery extends Query<TWorkflowVarGroup[]> {
	static readonly type = '[Xpert Agent] Get state variables'

	constructor(
		public readonly options: {
			xpertId: string
			type?: 'input' | 'output'
			nodeKey?: string,
			inputs?: string[],

			/**
			 * Draft First
			 */
			isDraft?: boolean,
			environmentId?: string
		},
	) {
		super()
	}
}
