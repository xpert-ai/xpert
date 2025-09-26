import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IIntegration,
	IWFNCode,
	IWFNSource,
	IWorkflowNode,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AgentStateAnnotation, nextWorkflowNodes, stateWithEnvironment } from '../../../shared'
import { KnowledgeStrategyQuery } from '../../../knowledgebase'
import { IDocumentSourceStrategy } from '@xpert-ai/plugin-sdk'
import { GetIntegrationQuery } from '@metad/server-core'

const ErrorChannelName = 'error'
const LogsChannelName = 'logs'

export function createSourceNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
	}
) {
	const { commandBus, queryBus, environment } = params
	const entity = node.entity as IWFNSource

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, knowledgebaseId, knowledgeTaskId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				console.log('Source Node config', entity, knowledgebaseId, knowledgeTaskId)

				const strategy = await queryBus.execute<KnowledgeStrategyQuery, IDocumentSourceStrategy>(
											new KnowledgeStrategyQuery({
												type: 'source',
												name: entity.provider
											})
										)
				const permissions: {integration?: IIntegration} = {}
				if (strategy.permissions) {
					const integrationPermission = strategy.permissions.find((permission) => permission.type === 'integration')
					if (integrationPermission) {
						const integration = await queryBus.execute<GetIntegrationQuery, IIntegration>(new GetIntegrationQuery(entity.integrationId))
						permissions[integrationPermission.type] = integration
					}
				}

				const results = await strategy.loadDocuments(entity.config, permissions)

				return {
					[channelName(node.key)]: {
						results
					}
				}
			}),
			ends: []
		},
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
        },
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			if (state[channelName(node.key)][ErrorChannelName]) {
				return (
					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
					END
				)
			}

			return nextWorkflowNodes(graph, node.key, state)
		}
	}
}

export function sourceOutputVariables(entity: IWorkflowNode) {
	return [
		...((<IWFNCode>entity).outputs ?? []),
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
			type: XpertParameterTypeEnum.STRING,
			name: LogsChannelName,
			title: 'Logs',
			description: {
				en_US: 'Logs info',
				zh_Hans: '日志信息'
			}
		}
	]
}
