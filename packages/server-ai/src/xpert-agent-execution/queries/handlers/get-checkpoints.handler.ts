import { CheckpointTuple } from '@langchain/langgraph-checkpoint'
import { TXpertAgentExecutionCheckpoint } from '@xpert-ai/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionCheckpointsQuery } from '../get-checkpoints.query'

@QueryHandler(XpertAgentExecutionCheckpointsQuery)
export class XpertAgentExecutionCheckpointsHandler implements IQueryHandler<XpertAgentExecutionCheckpointsQuery> {
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionCheckpointsQuery): Promise<TXpertAgentExecutionCheckpoint[]> {
		const execution = await this.service.findOne(command.id)
		if (!execution?.threadId || !execution.checkpointId) {
			return []
		}

		const checkpoints: TXpertAgentExecutionCheckpoint[] = []
		const visited = new Set<string>()
		let checkpointId: string | null = execution.checkpointId

		while (checkpointId) {
			if (visited.has(checkpointId)) {
				break
			}
			visited.add(checkpointId)

			const tuple = await this.queryBus.execute<
				CopilotCheckpointGetTupleQuery,
				CheckpointTuple | undefined
			>(
				new CopilotCheckpointGetTupleQuery({
					thread_id: execution.threadId,
					checkpoint_ns: execution.checkpointNs ?? '',
					checkpoint_id: checkpointId
				})
			)

			if (!tuple) {
				break
			}

			const resolvedCheckpointId = tuple.config?.configurable?.checkpoint_id ?? checkpointId
			const parentCheckpointId = tuple.parentConfig?.configurable?.checkpoint_id ?? null
			checkpoints.unshift({
				threadId: execution.threadId,
				checkpointNs: execution.checkpointNs ?? '',
				checkpointId: resolvedCheckpointId,
				parentCheckpointId,
				createdAt: tuple.checkpoint?.ts ?? null,
				metadata: (tuple.metadata as Record<string, unknown>) ?? null,
				isCurrent: resolvedCheckpointId === execution.checkpointId
			})

			checkpointId = parentCheckpointId
		}

		return checkpoints
	}
}
