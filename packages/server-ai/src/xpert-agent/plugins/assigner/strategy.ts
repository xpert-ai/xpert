import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNAssigner,
	IWorkflowNode,
	IXpertAgentExecution,
	setStateVariable,
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

const ErrorChannelName = 'error'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.ASSIGNER)
export class WorkflowAssignerNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.ASSIGNER,
		label: {
			en_US: 'Assigner',
			zh_Hans: '分配器'
		},
		icon: {
			svg: '',
			color: '#14b8a6'
		},
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
		const entity = node.entity as IWFNAssigner

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const assigners = entity.assigners

				const inputs = {}
				// Write to memory
				const nState = {}
				assigners.forEach((item, index) => {
					if (!item.variableSelector) {
						throw new Error(
							`Variable is required for item '${index}' in assigner: ${workflowNodeIdentifier(entity)}`
						)
					}
					if (!item.value) {
						throw new Error(
							`Value is required for item '${index}' in assigner: ${workflowNodeIdentifier(entity)}`
						)
					}
					if (item.inputType === 'constant') {
						setStateVariable(inputs, item.value, item.value)
						setStateVariable(nState, item.variableSelector, item.value)
					} else if (item.inputType === 'variable') {
						setStateVariable(inputs, item.value, get(stateEnv, item.value))
						setStateVariable(nState, item.variableSelector, get(stateEnv, item.value))
					}
				})

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.ASSIGNER,
					inputs,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						return {
							state: nState,
							output: JSON.stringify(nState, null, 2)
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
		return [
			{
				type: XpertParameterTypeEnum.STRING,
				name: ErrorChannelName,
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			}
		]
	}
}
