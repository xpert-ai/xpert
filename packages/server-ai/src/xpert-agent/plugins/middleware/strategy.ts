import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWFNMiddleware,
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
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

const OutputChannelName = 'output'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.MIDDLEWARE)
export class WorkflowMiddlewareNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.MIDDLEWARE,
		label: {
			en_US: 'Agent Middleware',
			zh_Hans: '智能体中间件'
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
		const entity = node.entity as IWFNMiddleware

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.MIDDLEWARE,
					inputs: {},
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
							state: {
								[channelName(node.key)]: {
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
				name: OutputChannelName,
				title: 'Output',
				description: {
					en_US: 'Output String',
					zh_Hans: '输出字符串'
				}
			}
		]
	}
}
