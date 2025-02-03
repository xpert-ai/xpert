import { IQuery } from '@nestjs/cqrs'

/**
 * Get state variables definations of xpert agent.
 */
export class XpertAgentVariablesQuery implements IQuery {
	static readonly type = '[Xpert Agent] Get state variables'

	constructor(
		public readonly xpertId: string,
		public readonly agentKey?: string,
		/**
		 * Draft First
		 */
		public readonly isDraft?: boolean,
	) {}
}
