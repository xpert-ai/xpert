import { IEnvironment, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

export class CreateWNKnowledgeRetrievalCommand implements ICommand {
	static readonly type = '[Xpert Agent] Create workflow node Knowledge Retrieval'

	constructor(
        public readonly xpertId: string,
        public readonly graph: TXpertGraph,
        public readonly node: TXpertTeamNode & { type: 'workflow' },
        public readonly options: {
            isDraft: boolean
            // The subscriber response to client
			subscriber: Subscriber<MessageEvent>
            environment: IEnvironment
        }
    ) {}
}
