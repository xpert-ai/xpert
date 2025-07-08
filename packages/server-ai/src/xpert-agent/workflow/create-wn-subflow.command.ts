import { IEnvironment, TXpertAgentConfig, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'

export class CreateWNSubflowCommand implements ICommand {
	static readonly type = '[Xpert Agent] Create workflow node subflow'

	constructor(
        public readonly xpertId: string,
        public readonly graph: TXpertGraph,
        public readonly node: TXpertTeamNode & { type: 'workflow' },
        public readonly options: {
            isDraft: boolean
            mute: TXpertAgentConfig['mute']
            // The subscriber response to client
			subscriber: Subscriber<MessageEvent>
            environment: IEnvironment
        }
    ) {}
}
