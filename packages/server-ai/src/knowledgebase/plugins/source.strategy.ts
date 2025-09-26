import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IIntegration,
	IWFNSource,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { GetIntegrationQuery } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
	IDocumentSourceStrategy,
	IWorkflowNodeStrategy,
	TWorkflowNodeParams,
	WorkflowNodeStrategy
} from '@xpert-ai/plugin-sdk'
import { AgentStateAnnotation, stateWithEnvironment } from '../../shared'
import { KnowledgeStrategyQuery } from '../queries'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.SOURCE)
export class WorkflowSourceNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.SOURCE,
		label: {
			en_US: 'Schedule Trigger',
			zh_Hans: '定时触发器'
		},
		icon: {
			svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6177 5.9681L19.0711 4.51472L20.4853 5.92893L19.0319 7.38231C20.2635 8.92199 21 10.875 21 13C21 17.9706 16.9706 22 12 22C7.02944 22 3 17.9706 3 13C3 8.02944 7.02944 4 12 4C14.125 4 16.078 4.73647 17.6177 5.9681ZM12 20C15.866 20 19 16.866 19 13C19 9.13401 15.866 6 12 6C8.13401 6 5 9.13401 5 13C5 16.866 8.13401 20 12 20ZM11 8H13V14H11V8ZM8 1H16V3H8V1Z"></path></svg>',
			color: '#14b8a6'
		},
		configSchema: {
			type: 'object',
			properties: {
			},
			required: []
		}
	}

	constructor(private readonly queryBus: QueryBus) {}

	create(payload: {
		graph: TXpertGraph
		node: TXpertTeamNode & { type: 'workflow' }
		xpertId: string
		environment: IEnvironment
	}): { name?: string; graph: Runnable; ends: string[]; channel: { name: string; annotation: BaseChannel } } {
		const { graph, node, xpertId, environment } = payload
		const entity = node.entity as IWFNSource

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const {
					thread_id,
					checkpoint_ns,
					checkpoint_id,
					subscriber,
					executionId,
					knowledgebaseId,
					knowledgeTaskId
				} = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				console.log('Source Node config', entity, knowledgebaseId, knowledgeTaskId)

				const strategy = await this.queryBus.execute<KnowledgeStrategyQuery, IDocumentSourceStrategy>(
					new KnowledgeStrategyQuery({
						type: 'source',
						name: entity.provider
					})
				)
				const permissions: { integration?: IIntegration } = {}
				if (strategy.permissions) {
					const integrationPermission = strategy.permissions.find(
						(permission) => permission.type === 'integration'
					)
					if (integrationPermission) {
						const integration = await this.queryBus.execute<GetIntegrationQuery, IIntegration>(
							new GetIntegrationQuery(entity.integrationId)
						)
						permissions[integrationPermission.type] = integration
					}
				}

				const results = await strategy.loadDocuments(entity.config, permissions)

				console.log('================== Source Node results ===================')
				console.log(JSON.stringify(results, null, 2))
				console.log('================== Source Node End ===================')

				return {
					[channelName(node.key)]: {
						results
					}
				}
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
	execute(payload: TWorkflowNodeParams<any>): Promise<any> {
		throw new Error('Method not implemented.')
	}
	stop?(payload: TWorkflowNodeParams<any>): void {
		throw new Error('Method not implemented.')
	}
}
