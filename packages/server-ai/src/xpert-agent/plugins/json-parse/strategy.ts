import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNJSONParse,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	workflowNodeIdentifier,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

const OutputChannelName = 'output'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.JSON_PARSE)
export class WorkflowJSONParseNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.JSON_PARSE,
		label: {
			en_US: 'JSON Parse',
			zh_Hans: 'JSON 解析'
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
	}) {
		const { graph, node, xpertId, environment, isDraft } = payload
		const entity = node.entity as IWFNJSONParse

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const inputVariable = entity.inputVariable
				if (!inputVariable) {
					throw new Error(`Input Variable is required: ${workflowNodeIdentifier(entity)}`)
				}

				const inputStr = get(stateEnv, inputVariable)

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.JSON_PARSE,
					inputs: inputStr,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						if (!inputStr || typeof inputStr !== 'string') {
							throw new Error(
								`Input Variable "${inputVariable}" is empty or not a string: ${workflowNodeIdentifier(entity)}`
							)
						}
						let result = null
						// Parse JSON
						try {
							result = JSON.parse(inputStr)
						} catch (error) {
							throw new Error(`Failed to parse JSON from variable "${inputVariable}": ${error.message}`)
						}
						return {
							state: {
								[channelName(node.key)]: {
									[OutputChannelName]: result
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
				type: XpertParameterTypeEnum.OBJECT,
				name: OutputChannelName,
				title: 'Output',
				description: {
					en_US: 'Output Object',
					zh_Hans: '输出对象'
				}
			}
		]
	}
}
