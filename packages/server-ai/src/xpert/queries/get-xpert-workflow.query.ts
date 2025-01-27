import { IQuery } from '@nestjs/cqrs'

/**
 * Get agent workflow of xpert with team (xpert).
 * - Get the root agent if agentKey is not provided.
 * - Get draft version if draft is provided.
 */
export class GetXpertWorkflowQuery implements IQuery {
	static readonly type = '[Xpert] Get workflow of agent'

	constructor(
        public readonly id: string,
        public readonly agentKey?: string,
        public readonly draft?: boolean
    ) {}
}
