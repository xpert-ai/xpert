import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNDBQuery,
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
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.DB_QUERY)
export class WorkflowDBQueryNodeStrategy implements IWorkflowNodeStrategy {
	readonly logger = new Logger(WorkflowDBQueryNodeStrategy.name)

	readonly meta: TWorkflowNodeMeta = {
		name: WorkflowNodeTypeEnum.DB_QUERY,
		label: {
			en_US: 'Database Query',
			zh_Hans: '数据库查询'
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
		const entity = node.entity as IWFNDBQuery

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

				// Extract limit from state if it's a variable reference
				let limit = entity.limit
				if (entity.limit && typeof entity.limit === 'string') {
					const parsed = parseInt(entity.limit as unknown as string, 10)
					if (!isNaN(parsed)) {
						limit = parsed
					}
				}

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.DB_QUERY,
					inputs: { 
						columns: entity.columns, 
						where: whereConditions, 
						orderBy: entity.orderBy, 
						limit 
					},
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						const output = await this.tableService.queryRows(entity.tableId, {
							columns: entity.columns,
							where: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
							orderBy: entity.orderBy,
							limit
						})

						return {
							state: {
								[channelName(node.key)]: {
									result: output,
									message: 'Database query executed successfully.'
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
				type: XpertParameterTypeEnum.ARRAY,
				name: 'result',
				title: 'Result',
				description: {
					en_US: 'Query result rows',
					zh_Hans: '查询结果行'
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
