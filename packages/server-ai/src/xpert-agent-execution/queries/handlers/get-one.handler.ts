import { BaseMessage, mapChatMessagesToStoredMessages, SystemMessage } from '@langchain/core/messages'
import { channelName, IXpertAgent, IXpertAgentExecution, OrderTypeEnum } from '@metad/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { GetXpertAgentQuery } from '../../../xpert/queries'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionDTO } from '../../dto'
import { XpertAgentExecutionOneQuery } from '../get-one.query'

@QueryHandler(XpertAgentExecutionOneQuery)
export class XpertAgentExecutionOneHandler implements IQueryHandler<XpertAgentExecutionOneQuery> {
	constructor(
		private readonly service: XpertAgentExecutionService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecutionOneQuery): Promise<IXpertAgentExecution> {
		const id = command.id
		const execution = await this.service.findOne(id, { relations: ['createdBy', 'xpert'] })

		return await this.expandExecutionTree(execution)
	}

	private async expandExecutionTree(execution: IXpertAgentExecution): Promise<IXpertAgentExecution> {
		// First expand your own Checkpoint and Agent
		const expandedExecution = await this.expandExecutionLatestCheckpoint(execution)

		// Query and recursively expand subtasks
		const subExecutions = await this.expandSubExecutions(execution)

		const expandedSubExecutions = await Promise.all(subExecutions.map((sub) => this.expandExecutionTree(sub)))

		return {
			...expandedExecution,
			subExecutions: expandedSubExecutions
		}
	}

	async expandSubExecutions(execution: IXpertAgentExecution) {
		const { items: executions } = await this.service.findAll({
			where: {
				parentId: execution.id
			},
			relations: ['createdBy', 'xpert'],
			order: {
				createdAt: OrderTypeEnum.ASC
			}
		})
		return executions
	}

	async expandExecutionLatestCheckpoint(execution: IXpertAgentExecution, parent?: IXpertAgentExecution) {
		let agent = null
		if (execution.xpertId && execution.agentKey) {
			agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
				new GetXpertAgentQuery(execution.xpertId, execution.agentKey, true)
			)
		}
		if (!execution.threadId) {
			return { ...execution, agent }
		}

		const tuple = await this.queryBus.execute(
			new CopilotCheckpointGetTupleQuery({
				thread_id: execution.threadId,
				checkpoint_ns: execution.checkpointNs ?? '',
				checkpoint_id: execution.checkpointId ?? (execution.checkpointNs ? null : parent?.checkpointId)
			})
		)

		const channel_name = execution.channelName || (execution.agentKey ? channelName(execution.agentKey) : null)
		const channel = tuple?.checkpoint?.channel_values?.[channel_name]
		const _messages: BaseMessage[] = channel?.messages ?? tuple?.checkpoint?.channel_values?.messages
		if (_messages && channel?.system) {
			_messages.unshift(new SystemMessage(channel.system))
		}
		return new XpertAgentExecutionDTO({
			...execution,
			messages: _messages ? mapChatMessagesToStoredMessages(_messages) : execution.messages,
			totalTokens: execution.totalTokens,
			summary: channel?.summary,
			agent
		})
	}
}
