import { IXpertAgent, TXpertGraph, TXpertTeamNode } from '@metad/contracts';
import { IQuery } from '@nestjs/cqrs'

export type TXpertWorkflowQueryOutput = {
    agent?: IXpertAgent;
    graph: TXpertGraph;
    next?: TXpertTeamNode[];
    fail?: TXpertTeamNode[];
}

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
        /**
         * Draft First
         */
        public readonly draft?: boolean
    ) {}
}
