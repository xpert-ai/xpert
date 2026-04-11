import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionStateQuery } from '../get-state.query'

@QueryHandler(XpertAgentExecutionStateQuery)
export class XpertAgentExecutionStateHandler implements IQueryHandler<XpertAgentExecutionStateQuery> {
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionStateQuery): Promise<Record<string, unknown>> {
		const id = command.id
		const execution = await this.service.findOne(id)

		if (!execution.threadId) {
			return {}
		}

		const tuple = await this.queryBus.execute(
			new CopilotCheckpointGetTupleQuery({
				thread_id: execution.threadId,
				checkpoint_ns: execution.checkpointNs ?? '',
				checkpoint_id: command.checkpointId ?? execution.checkpointId
			})
		)
		return tuple?.checkpoint?.channel_values ?? {}
	}
}
