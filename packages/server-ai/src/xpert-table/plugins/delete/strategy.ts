import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNDBDelete,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TWorkflowNodeMeta,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { XpertTableService } from '../../xpert-table.service'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.DB_DELETE)
export class WorkflowDBDeleteNodeStrategy implements IWorkflowNodeStrategy {
	readonly logger = new Logger(WorkflowDBDeleteNodeStrategy.name)

	readonly meta: TWorkflowNodeMeta = {
		name: WorkflowNodeTypeEnum.DB_DELETE,
		label: {
			en_US: 'Database Delete',
			zh_Hans: '数据库删除'
		},
		icon: null,
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	@Inject(XpertTableService)
	private readonly tableService: XpertTableService

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	create(payload: {
		graph: TXpertGraph
		node: TXpertTeamNode & { type: 'workflow' }
		xpertId: string
		environment: IEnvironment
		isDraft: boolean
	}) {
		const { graph, node, xpertId, environment, isDraft } = payload
		const entity = node.entity as IWFNDBDelete

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				// Extract WHERE conditions from state
				const whereConditions: Record<string, any> = {}
				if (entity.where && entity.where.length > 0) {
					for (const condition of entity.where) {
						let value = condition.value
						if (condition.valueSelector) {
							value = get(stateEnv, condition.valueSelector)
						}
						// Map condition name to value
						whereConditions[condition.name] = value
					}
				}

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.DB_DELETE,
					inputs: { where: whereConditions },
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						const output = await this.tableService.deleteRows(
							entity.tableId,
							Object.keys(whereConditions).length > 0 ? whereConditions : undefined
						)

						return {
							state: {
								[channelName(node.key)]: {
									message: 'Database delete executed successfully.',
									rowsAffected: output
								}
							},
							output
						}
					},
					{
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution
					}
				)()
			}),
			ends: []
		}
	}

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		return [
			{
				type: XpertParameterTypeEnum.NUMBER,
				name: 'rowsAffected',
				title: 'Rows Affected',
				description: {
					en_US: 'Number of rows affected by the delete',
					zh_Hans: '删除影响的行数'
				}
			},
			{
				type: XpertParameterTypeEnum.STRING,
				name: 'error',
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			}
		]
	}
}
