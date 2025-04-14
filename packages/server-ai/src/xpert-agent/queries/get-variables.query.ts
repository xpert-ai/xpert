import { IQuery } from '@nestjs/cqrs'

/**
 * Get state variables definations of xpert agent or workflow node.
 */
export class XpertAgentVariablesQuery implements IQuery {
	static readonly type = '[Xpert Agent] Get state variables'

	constructor(
		public readonly options: {
			xpertId: string
			type?: 'agent' | 'workflow'
			nodeKey?: string,
			/**
			 * Draft First
			 */
			isDraft?: boolean,
			environmentId?: string
		},
	) {}
}
