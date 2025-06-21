import { IEnvironment, IXpert, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

export class CreateWNClassifierCommand implements ICommand {
	static readonly type = '[Xpert Agent] Create workflow node classifier'

	constructor(
        public readonly xpert: IXpert,
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
