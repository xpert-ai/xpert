import { IEnvironment, IXpert, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

/**
 * Create artifacts for workflow node in graph.
 * 
 * @returns
 *  workflowNode:
 *    graph:
 *    ends:
 *  navigator:
 *  channel: Channel for the workflow node
 *  nextNodes: Next nodes
 */
export class CreateWorkflowNodeCommand implements ICommand {
	static readonly type = '[Xpert Agent] Create workflow node'

	constructor(
        public readonly xpertId: string,
        public readonly graph: TXpertGraph,
        public readonly node: TXpertTeamNode & { type: 'workflow' },
        public readonly leaderKey: string,
        public readonly options: {
            isDraft: boolean
            // The subscriber response to client
			subscriber: Subscriber<MessageEvent>
            environment: IEnvironment
            xpert: Partial<IXpert>
            conversationId?: string
        }
    ) {}
}
