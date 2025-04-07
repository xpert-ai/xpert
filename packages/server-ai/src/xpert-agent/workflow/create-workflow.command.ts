import { TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

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
            rootExecutionId: string
        }
    ) {}
}
