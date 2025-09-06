import { BaseMessage, mapChatMessagesToStoredMessages, SystemMessage } from '@langchain/core/messages'
import { channelName, IXpert, IXpertAgent, IXpertAgentExecution, OrderTypeEnum } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
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
		const agents = getXpertDraftAgents(execution.xpert)
		const expandedExecution = await this.expandExecutionLatestCheckpoint({
			...execution,
			agent: execution.agentKey ? agents.find((agent) => agent.key === execution.agentKey) : null
		})
		return await this.expandExecutionTree(expandedExecution, agents)
	}

	private async expandExecutionTree(
		execution: IXpertAgentExecution,
		agents: IXpertAgent[]
	): Promise<IXpertAgentExecution> {
		// First expand your own Checkpoint and Agent
		// const expandedExecution = await this.expandExecutionLatestCheckpoint(execution)

		// Query and recursively expand subtasks
		const subExecutions = await this.expandSubExecutions(execution, agents)

		const expandedSubExecutions = await Promise.all(
			subExecutions.map((sub) => this.expandExecutionTree(sub, agents))
		)

		return {
			// ...expandedExecution,
			...execution,
			subExecutions: expandedSubExecutions
		}
	}

	async expandSubExecutions(execution: IXpertAgentExecution, agents: IXpertAgent[]) {
		const { items: executions } = await this.service.findAll({
			where: {
				parentId: execution.id
			},
			relations: ['createdBy', 'xpert'],
			order: {
				createdAt: OrderTypeEnum.ASC
			}
		})
		return executions.map((item) => {
			return {
				...item,
				agent: item.agentKey ? agents.find((agent) => agent.key === item.agentKey) : null
			}
		})
	}

	async expandExecutionLatestCheckpoint(execution: IXpertAgentExecution, parent?: IXpertAgentExecution) {
		// let agent = null
		// if (execution.xpertId && execution.agentKey) {
		// 	agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
		// 		new GetXpertAgentQuery(execution.xpertId, execution.agentKey, true)
		// 	)
		// }
		if (!execution.threadId) {
			return execution // { ...execution, agent }
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
			// agent
		})
	}
}

function getXpertDraft(xpert: IXpert) {
	return (
		xpert.draft ?? {
			...(xpert.graph ?? {}),
			team: omit(xpert, 'draft', 'graph')
		}
	)
}

function getXpertDraftAgents(xpert: IXpert) {
	const draft = getXpertDraft(xpert)
	return draft.nodes.filter((node) => node.type === 'agent').map((node) => node.entity) as IXpertAgent[]
}
