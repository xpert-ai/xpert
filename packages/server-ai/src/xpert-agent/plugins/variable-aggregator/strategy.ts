import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNVariableAggregator,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { nonNullable } from '@metad/server-common'

const ErrorChannelName = 'error'
const ResultChannelName = 'result'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR)
export class WorkflowVariableAggregatorNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR,
		label: {
			en_US: 'Variable aggregator',
			zh_Hans: '变量聚合器'
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
		const entity = node.entity as IWFNVariableAggregator

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const values = entity.inputs.map((input) => get(stateEnv, input))

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.VARIABLE_AGGREGATOR,
					inputs: values,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						const result = values.flat().filter(nonNullable)
						return {
							state: {
								[channelName(node.key)]: {
									[ResultChannelName]: result,
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
		const node = entity as IWFNVariableAggregator
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
				type: node.outputType as XpertParameterTypeEnum,
				title: 'Result',
				description: {
					en_US: 'The result of aggregation operation',
					zh_Hans: '聚合操作的结果'
				}
			}
		]
	}
}
