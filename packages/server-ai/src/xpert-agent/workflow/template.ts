import { RunnableLambda } from '@langchain/core/runnables'
import { END } from '@langchain/langgraph'
import {
	channelName,
	IWFNTemplate,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import Handlebars from 'handlebars'
import { get } from 'lodash'
import { wrapAgentExecution } from '../../xpert-agent-execution/utils'
import { AgentStateAnnotation } from '../commands/handlers/types'

const ErrorChannelName = 'error'

export function createTemplateNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
	}
) {
	const { commandBus, queryBus } = params
	const entity = node.entity as IWFNTemplate
	const inputParams = entity.inputParams
	const template = entity.code

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const inputs =
					inputParams?.reduce((acc, curr) => {
						acc[curr.name] = get(state, curr.variable)
						return acc
					}, {}) ?? {}

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.TEMPLATE,
					inputs: inputs,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						const compiledTemplate = Handlebars.compile(template)
						const output = compiledTemplate(inputs)

						return {
							state: {
								[channelName(node.key)]: {
									output
								}
							},
							output
						}
					},
					{
						commandBus: commandBus,
						queryBus: queryBus,
						subscriber: subscriber,
						execution
					}
				)()
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			if (state[channelName(node.key)][ErrorChannelName]) {
				return (
					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
					END
				)
			}
			return graph.connections.find((conn) => conn.type === 'edge' && conn.from === node.key)?.to ?? END
		}
	}
}

export function templateOutputVariables(entity: IWorkflowNode) {
	return [
		{
			type: XpertParameterTypeEnum.STRING,
			name: 'output',
			title: 'Output',
			description: {
				en_US: 'Transformed content',
				zh_Hans: '转换后内容'
			}
		}
	]
}
