import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNDBSql,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { XpertTableService } from '../../xpert-table.service'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.DB_SQL)
export class WorkflowDBSQLNodeStrategy implements IWorkflowNodeStrategy {
	readonly logger = new Logger(WorkflowDBSQLNodeStrategy.name)

	readonly meta = {
		name: WorkflowNodeTypeEnum.DB_SQL,
		label: {
			en_US: 'SQL Custom',
			zh_Hans: 'SQL 自定义'
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
		const entity = node.entity as IWFNDBSql

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				// Extract columns values from state
				const statement = await PromptTemplate.fromTemplate(entity.sqlTemplate, {
					templateFormat: 'mustache'
				}).format(stateEnv)

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.DB_SQL,
					inputs: statement,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						const result = await this.tableService.executeSql(entity.tableId, statement)

						return {
							state: {
								[channelName(node.key)]: {
									result
								}
							},
							output: result
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
				type: XpertParameterTypeEnum.STRING,
				name: 'result',
				title: 'Result',
				description: {
					en_US: 'Result info',
					zh_Hans: '结果信息'
				}
			}
		]
	}
}
