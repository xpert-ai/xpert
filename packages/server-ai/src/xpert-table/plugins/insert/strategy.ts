import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNDBInsert,
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
import { get } from 'lodash'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { XpertTableService } from '../../xpert-table.service'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.DB_INSERT)
export class WorkflowDBInsertNodeStrategy implements IWorkflowNodeStrategy {
	readonly logger = new Logger(WorkflowDBInsertNodeStrategy.name)

	readonly meta = {
		name: WorkflowNodeTypeEnum.DB_INSERT,
		label: {
			en_US: 'Database Insert',
			zh_Hans: '数据库插入'
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
		const entity = node.entity as IWFNDBInsert

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				// Extract columns values from state
				const columns = []
				for await (const [_, v] of Object.entries(entity.columns || {})) {
					let value = v.value
					if (v.valueSelector) {
						value = get(stateEnv, v.valueSelector)
					}

					columns.push({
						name: _,
						value: value,
						type: v.type
					})
				}

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.DB_INSERT,
					inputs: columns,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {

						console.log('Database insert executed:', stateEnv)
						console.log(JSON.stringify(entity, null, 2))

						await this.tableService.insertRow(entity.tableId, columns)

						return {
							state: {
								[channelName(node.key)]: {
									message: 'Database insert executed successfully.'
								}
							},
							output: []
						}
					},
					{
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution
						// catchError: async (error) => {
						// 	if (!isTest) {
						// 		for await (const {id} of value) {
						// 			await this.documentService.update(id, { status: KBDocumentStatusEnum.ERROR, processMsg: getErrorMessage(error) })
						// 		}
						// 		await this.taskService.update(knowledgeTaskId, { status: 'failed', error: getErrorMessage(error) })
						// 	}
						// }
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
				name: 'outputs',
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			}
		]
	}
}
