import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNListOperator,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TWFCaseCondition,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowLogicalOperator,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { evaluateCondition } from '../../types'

const ErrorChannelName = 'error'
const ResultChannelName = 'result'
const FirstRecordChannelName = 'first_record'
const LastRecordChannelName = 'last_record'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.LIST_OPERATOR)
export class WorkflowListOperatorNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.LIST_OPERATOR,
		label: {
			en_US: 'List operator',
			zh_Hans: '列表操作符'
		},
		icon: null,
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

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
	}): { name?: string; graph: Runnable; ends: string[]; channel: { name: string; annotation: BaseChannel } } {
		const { graph, node, xpertId, environment, isDraft } = payload
		const entity = node.entity as IWFNListOperator

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)
				const value = get(stateEnv, entity.input)

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.LIST_OPERATOR,
					inputs: value,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						// console.log('Chunker input value:', entity.input, value)
						let result = value
						if (!Array.isArray(value)) {
							throw new Error(`The input value of List Operator must be an array.`)
						}

						if (entity.filterBy?.enabled) {
							const conditions = entity.filterBy.conditions
							const logicalOperator = entity.filterBy.logicalOperator
							result = result.filter((item) => {
								const condition = (condition: TWFCaseCondition) => {
									return evaluateCondition(condition, item)
								}
								if (logicalOperator === WorkflowLogicalOperator.AND) {
									return conditions.every(condition)
								} else {
									return conditions.some(condition)
								}
							})
						}

						if (entity.extractBy?.enabled) {
							const index = entity.extractBy.index
							if (index === 0 || index > result.length || index < -result.length) {
								result = []
							} else if (index < 0) {
								result = [result[result.length + index]]
							} else {
								result = [result[index - 1]]
							}
						}

						if (entity.sortBy?.enabled) {
							const variable = entity.sortBy.variable
							const descending = entity.sortBy?.descending ?? false
							result = result.sort((a, b) => {
								const va = get(a, variable)
								const vb = get(b, variable)
								if (va === vb) return 0
								if (va === undefined || va === null) return 1
								if (vb === undefined || vb === null) return -1
								if (va < vb) return descending ? 1 : -1
								if (va > vb) return descending ? -1 : 1
								return 0
							})
						}

						if (entity.topN?.enabled) {
							const count = entity.topN.count
							if (count > 0 && result.length > count) {
								result = result.slice(0, count)
							}
						}

						return {
							state: {
								[channelName(node.key)]: {
									[ResultChannelName]: result,
									[FirstRecordChannelName]: result[0],
									[LastRecordChannelName]: result[result.length - 1],
									[ErrorChannelName]: null
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
			ends: [],
			channel: {
				name: channelName(node.key),
				annotation: Annotation<Record<string, unknown>>({
					reducer: (a, b) => {
						return b
							? {
									...a,
									...b
								}
							: a
					},
					default: () => ({})
				})
			}
		}
	}

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		const node = entity as IWFNListOperator
		return [
			{
				type: XpertParameterTypeEnum.STRING,
				name: ErrorChannelName,
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			},
			{
				name: ResultChannelName,
				type: `array[${node.itemVarType}]` as XpertParameterTypeEnum,
				title: 'Result',
				description: {
					en_US: 'The result of list operator',
					zh_Hans: '列表操作符的结果'
				}
			},
			{
				name: FirstRecordChannelName,
				type: node.itemVarType as XpertParameterTypeEnum,
				title: 'First record',
				description: {
					en_US: 'The first record of the result',
					zh_Hans: '结果的第一条记录'
				}
			},
			{
				name: LastRecordChannelName,
				type: node.itemVarType as XpertParameterTypeEnum,
				title: 'Last record',
				description: {
					en_US: 'The last record of the result',
					zh_Hans: '结果的最后一条记录'
				}
			}
		]
	}
}
