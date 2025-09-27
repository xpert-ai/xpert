import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IIntegration,
	IWFNSource,
	IWorkflowNode,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum,
	KnowledgebaseChannel,
	KnowledgeTask,
	KnowledgeSources
} from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { GetIntegrationQuery } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { IDocumentSourceStrategy, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { KnowledgeStrategyQuery } from '../../queries'
import { KnowledgebaseTaskService } from '../../task/index'


@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.SOURCE)
export class WorkflowSourceNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.SOURCE,
		label: {
			en_US: 'Document Source',
			zh_Hans: '文档源'
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

	@Inject(KnowledgebaseTaskService)
	private readonly taskService: KnowledgebaseTaskService

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
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const knowledgebaseState = state[KnowledgebaseChannel]
				let KnowledgeTaskId = knowledgebaseState?.[KnowledgeTask]
				const knowledgebaseId = knowledgebaseState?.['knowledgebaseId']
				const knowledgeSources = knowledgebaseState?.[KnowledgeSources] as string[]
				// Skip this node if the source is not in the selected knowledge sources
				if (knowledgeSources && !knowledgeSources.includes(node.key)) {
					return {}
				}

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

				results.forEach((doc) => {
					doc.id = shortuuid()
				})

				if (!KnowledgeTaskId) {
					// create a new task id if not exists
					const task = await this.taskService.createTask(knowledgebaseId, {
						taskType: 'preprocess',
						context: {
							documents: results
						}
					})

					KnowledgeTaskId = task.id
				} else {
					await this.taskService.upsertDocuments(KnowledgeTaskId, results)
				}

				return {
					[channelName(node.key)]: {
						documents: results.map((doc) => doc.id)
					},
					[KnowledgebaseChannel]: {
						[KnowledgeTask]: KnowledgeTaskId,
						knowledgebaseId,

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

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		return [
			{
				type: XpertParameterTypeEnum.ARRAY_STRING,
				name: 'documents',
				title: 'Documents',
				description: {
					en_US: 'Documents IDs',
					zh_Hans: '文档 IDs'
				}
			},
			{
				type: XpertParameterTypeEnum.STRING,
				name: 'error',
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			},
		]
	}
}
