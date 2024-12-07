import { mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { IXpertAgentExecution } from '@metad/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { sortBy } from 'lodash'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionOneQuery } from '../get-one.query'
import { XpertAgentExecutionDTO } from '../../dto'


@QueryHandler(XpertAgentExecutionOneQuery)
export class XpertAgentExecutionOneHandler implements IQueryHandler<XpertAgentExecutionOneQuery> {
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionOneQuery): Promise<IXpertAgentExecution> {
		const id = command.id
		const execution = await this.service.findOne(id, { relations: ['subExecutions', 'createdBy', 'subExecutions.createdBy'] })

		const subExecutions = sortBy(execution.subExecutions, 'createdAt')

		return {
			...(await this.expandExecutionLatestCheckpoint(execution)),
			subExecutions: await Promise.all(subExecutions.map((item) => this.expandExecutionLatestCheckpoint(item)))
		}
	}

	async expandExecutionLatestCheckpoint(execution: IXpertAgentExecution) {
		if (!execution.threadId) {
			return execution
		}
		const tuple = await this.queryBus.execute(
			new CopilotCheckpointGetTupleQuery({ thread_id: execution.threadId, checkpoint_ns: '' })
		)
		const messages = tuple?.checkpoint?.channel_values?.messages
		return new XpertAgentExecutionDTO({
			...execution,
			messages: messages ? mapChatMessagesToStoredMessages(messages) : null,
			totalTokens: execution.totalTokens
		})
	}
}
