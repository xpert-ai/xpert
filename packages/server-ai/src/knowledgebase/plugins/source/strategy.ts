import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, Command, END } from '@langchain/langgraph'
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
	KnowledgeSources,
	KnowledgeDocuments,
	KBDocumentStatusEnum,
	IKnowledgeDocument,
	IXpertAgentExecution,
	STATE_VARIABLE_HUMAN,
	IKnowledgebaseTask,
	KnowledgeFolderId
} from '@metad/contracts'
import { omit, shortuuid } from '@metad/server-common'
import { GetIntegrationQuery } from '@metad/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IDocumentSourceStrategy, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { AgentStateAnnotation, deepTransformValue, nextWorkflowNodes, stateWithEnvironment } from '../../../shared'
import { KnowledgeStrategyQuery } from '../../queries'
import { KnowledgebaseTaskService } from '../../task/index'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { createDocumentsParameter, DOCUMENTS_CHANNEL_NAME, ERROR_CHANNEL_NAME, serializeDocuments } from '../types'
import { PromptTemplate } from '@langchain/core/prompts'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.SOURCE)
export class WorkflowSourceNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.SOURCE,
		label: {
			en_US: 'Document Source',
			zh_Hans: '文档源'
		},
		icon: null,
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	@Inject(KnowledgebaseTaskService)
	private readonly taskService: KnowledgebaseTaskService

	@Inject(KnowledgeDocumentService)
	private readonly documentService: KnowledgeDocumentService

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus) {}

	create(payload: {
		graph: TXpertGraph
		node: TXpertTeamNode & { type: 'workflow' }
		xpertId: string
		environment: IEnvironment
		isDraft: boolean
	}) {
		const { graph, node, xpertId, environment, isDraft } = payload
		const entity = node.entity as IWFNSource

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)

				const knowledgebaseState = state[KnowledgebaseChannel]
				console.log('================== Source Node state ===================')
				console.log(JSON.stringify(state, null, 2))
				console.log('================== Source Node End ===================')

				let KnowledgeTaskId = knowledgebaseState?.[KnowledgeTask]
				const knowledgebaseId = knowledgebaseState?.['knowledgebaseId']
				const stage = knowledgebaseState?.['stage']
				const isTest = stage === 'preview' || isDraft
				const knowledgeSources = knowledgebaseState?.[KnowledgeSources] as string[]
				const folderId = knowledgebaseState?.[KnowledgeFolderId] as string
				// Skip this node if the source is not in the selected knowledge sources
				if (knowledgeSources && !knowledgeSources.includes(node.key)) {
					return new Command({
						goto: END
					})
				}

				const execution: IXpertAgentExecution = {
									category: 'workflow',
									type: WorkflowNodeTypeEnum.SOURCE,
									inputs: entity.config,
									parentId: executionId,
									threadId: thread_id,
									checkpointNs: checkpoint_ns,
									checkpointId: checkpoint_id,
									agentKey: node.key,
									title: entity.title
								}
				return await wrapAgentExecution<any>(
					async () => {
						let documents: IKnowledgeDocument[] = null

						// If the node has already loaded documents
						const cachedDocuments = state[channelName(node.key)]?.[KnowledgeDocuments] as string[]
						if (cachedDocuments?.length) {
							// Create as formal documents during non-testing phases
							const task = await this.taskService.findOne(KnowledgeTaskId, { relations: ['documents'] })
							const _docs = task.context?.documents?.filter(doc => cachedDocuments.includes(doc.id)) ?? []
							if (isTest) {
								return {
									state: {
										[channelName(node.key)]: {
											[DOCUMENTS_CHANNEL_NAME]: serializeDocuments(_docs),
											[ERROR_CHANNEL_NAME]: null
										},
									}
								}
							}

							if (task.context?.documents) {
								if (_docs.length > 0) {
									documents = await this.documentService.createBulk(_docs.map((doc) => {
										return {
											...omit(doc, 'id'),
											sourceConfig: {
												key: node.key,
											},
											status: KBDocumentStatusEnum.WAITING,
											knowledgebaseId,
											pages: doc.pages?.map(page => omit(page, 'id')),
											tasks: [{id: KnowledgeTaskId} as IKnowledgebaseTask]
										}
									}))
								}
							} else {
								documents = task.documents.filter(doc => cachedDocuments.includes(doc.id))
								documents.forEach(doc => {
									doc.sourceConfig = { key: node.key }
									doc.status = KBDocumentStatusEnum.RUNNING
									if (doc.tasks?.findIndex(t => t.id === KnowledgeTaskId) < 0) {
										doc.tasks.push({id: KnowledgeTaskId} as IKnowledgebaseTask)
									}
								})
								if (documents.length > 0) {
								  await this.documentService.save(documents)
								}
							}
							
							return {
								state: {
									[channelName(node.key)]: {
										[DOCUMENTS_CHANNEL_NAME]: serializeDocuments(documents),
										[ERROR_CHANNEL_NAME]: null
									},
								},
								output: JSON.stringify(documents?.map((doc) => {
									doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
									doc.pages = doc.pages?.slice(0, 2)
									return doc
								}), null, 2)
							}
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
						
						const parameters = entity.config ? await deepTransformValue(entity.config, async (v) => {
							return await PromptTemplate.fromTemplate(v, { templateFormat: 'mustache' }).format(stateEnv)
						}) : {}

						const results = await strategy.loadDocuments({
							...parameters,
							[STATE_VARIABLE_HUMAN]: state[STATE_VARIABLE_HUMAN]
						}, permissions)

						documents = results.map((doc) => ({
							id: doc.id || shortuuid(),
							type: doc.metadata.type,
							name: doc.metadata.originalName || doc.metadata.title,
							filePath: doc.metadata.filePath,
							fileUrl: doc.metadata.fileUrl,
							status: KBDocumentStatusEnum.WAITING,
							metadata: doc.metadata,
							pages: doc.pageContent ? [
								{
									...doc,
									id: doc.id || shortuuid(),
								}
							] : null,
							parent: folderId ? { id: folderId } : null,
						} as IKnowledgeDocument))
						
						if (isTest) {
							if (!KnowledgeTaskId) {
								// create a new task id if not exists
								const task = await this.taskService.createTask(knowledgebaseId, {
									taskType: 'preprocess',
									context: {
										documents
									}
								})

								KnowledgeTaskId = task.id
							} else {
								await this.taskService.upsertDocuments(KnowledgeTaskId, documents)
							}
						} else {
							documents = await this.documentService.createBulk(documents.map((doc) => {
								return {
									...omit(doc, 'id'),
									status: KBDocumentStatusEnum.WAITING,
									// taskId: KnowledgeTaskId,
									knowledgebaseId,
									pages: doc.pages?.map(page => omit(page, 'id')),
									tasks: [{id: KnowledgeTaskId} as IKnowledgebaseTask]
								}
							}))
						}

						return {
							state: {
								[channelName(node.key)]: {
									[DOCUMENTS_CHANNEL_NAME]: serializeDocuments((documents ?? results)),
									[ERROR_CHANNEL_NAME]: null
								},
								[KnowledgebaseChannel]: {
									[KnowledgeTask]: KnowledgeTaskId,
									knowledgebaseId,
								}
							},
							output: JSON.stringify((documents ?? results).map((doc) => {
								doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
								doc.pages = doc.pages?.slice(0, 2)
								return doc
							}), null, 2)
						}
					},
					{
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution
					})()
			}),
			ends: [END],
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
			navigator: async (state, config) => {
				if (state[channelName(node.key)]['error']) {
					return (
						graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
						END
					)
				}

				if (!state[channelName(node.key)][DOCUMENTS_CHANNEL_NAME]) {
					return END
				}
	
				return nextWorkflowNodes(graph, node.key, state)
			}
		}
	}

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		const source = entity as IWFNSource
		return [
			...(source.parameters ?? []),
			createDocumentsParameter(DOCUMENTS_CHANNEL_NAME),
			{
				type: XpertParameterTypeEnum.STRING,
				name: ERROR_CHANNEL_NAME,
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			},
		]
	}
}
