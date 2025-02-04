import { IQuery } from '@nestjs/cqrs'

/**
 * @deprecated use `GetXpertWorkflowQuery`
 * 
 * Get agent of xpert with team (xpert).
 * - Get the root agent if agentKey is not provided.
 * - Get draft version if draft is provided.
 */
export class GetXpertAgentQuery implements IQuery {
	static readonly type = '[Xpert] Get one agent'

	constructor(
        public readonly id: string,
        public readonly agentKey?: string,
        /**
         * Draft First
         */
        public readonly draft?: boolean
    ) {}
}
