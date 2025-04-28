import { mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { channelName, IXpertAgent, IXpertAgentExecution } from '@metad/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { sortBy } from 'lodash'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionOneQuery } from '../get-one.query'
import { XpertAgentExecutionDTO } from '../../dto'
import { GetXpertAgentQuery } from '../../../xpert/queries'


@QueryHandler(XpertAgentExecutionOneQuery)
export class XpertAgentExecutionOneHandler implements IQueryHandler<XpertAgentExecutionOneQuery> {
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionOneQuery): Promise<IXpertAgentExecution> {
		const id = command.id
		const execution = await this.service.findOne(id, { relations: ['createdBy', 'xpert', 'subExecutions', 'subExecutions.createdBy', 'subExecutions.xpert'] })

		const subExecutions = sortBy(execution.subExecutions, 'createdAt')

		return {
			...(await this.expandExecutionLatestCheckpoint(execution)),
			subExecutions: await Promise.all(subExecutions.map((item) => this.expandExecutionLatestCheckpoint(item, execution)))
		}
	}

	async expandExecutionLatestCheckpoint(execution: IXpertAgentExecution, parent?: IXpertAgentExecution) {
		let agent = null
		if (execution.xpertId && execution.agentKey) {
			agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(new GetXpertAgentQuery(execution.xpertId, execution.agentKey, true))
		}
		if (!execution.threadId) {
			return {...execution, agent}
		}

		const tuple = await this.queryBus.execute(
			new CopilotCheckpointGetTupleQuery({
				thread_id: execution.threadId,
				checkpoint_ns: execution.checkpointNs ?? '',
				checkpoint_id: execution.checkpointId ?? (execution.checkpointNs ? null : parent?.checkpointId)
			})
		)

		const channel = execution.channelName || (execution.agentKey ? channelName(execution.agentKey) : null)
		const messages = tuple?.checkpoint?.channel_values?.[channel]?.messages ?? tuple?.checkpoint?.channel_values?.messages
		return new XpertAgentExecutionDTO({
			...execution,
			messages: messages ? mapChatMessagesToStoredMessages(messages) : execution.messages,
			totalTokens: execution.totalTokens,
			summary: tuple?.checkpoint?.channel_values?.[channel]?.summary,
			agent
		})
	}
}
