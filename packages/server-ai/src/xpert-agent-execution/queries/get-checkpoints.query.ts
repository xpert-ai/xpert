import { Query } from '@nestjs/cqrs'
import { TXpertAgentExecutionCheckpoint } from '@metad/contracts'

export class XpertAgentExecutionCheckpointsQuery extends Query<TXpertAgentExecutionCheckpoint[]> {
	static readonly type = '[Xpert Agent Execution] Get checkpoints'

	constructor(public readonly id: string) {
		super()
	}
}
