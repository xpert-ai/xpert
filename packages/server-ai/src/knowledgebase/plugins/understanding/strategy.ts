import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IWFNUnderstanding,
	IWorkflowNode,
	IXpertAgentExecution,
	JSONValue,
	KBDocumentStatusEnum,
	KNOWLEDGE_STAGE_NAME,
	KnowledgebaseChannel,
	KnowledgeTask,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ChunkMetadata, IImageUnderstandingStrategy, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash-es'
import { In } from 'typeorm'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgeStrategyQuery } from '../../queries'
import { KnowledgebaseTaskService } from '../../task'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { createDocumentsParameter, serializeDocuments } from '../types'
import { KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import { PluginPermissionsCommand } from '../../commands'

const ErrorChannelName = 'error'
const DocumentsChannelName = 'documents'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.UNDERSTANDING)
export class WorkflowUnderstandingNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.UNDERSTANDING,
		label: {
			en_US: 'Understanding',
			zh_Hans: '图像理解'
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
	}): { name?: string; graph: Runnable; ends: string[]; channel: { name: string; annotation: BaseChannel } } {
		const { graph, node, xpertId, environment, isDraft } = payload
		const entity = node.entity as IWFNUnderstanding

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, } = configurable
				const stateEnv = stateWithEnvironment(state, environment)
				const value = get(stateEnv, entity.input) as Partial<IKnowledgeDocument>[]
				const knowledgebaseState = state[KnowledgebaseChannel]
				const knowledgebaseId = state[KnowledgebaseChannel]?.['knowledgebaseId'] as string
				const knowledgeTaskId = state[KnowledgebaseChannel]?.[KnowledgeTask] as string
				const stage = knowledgebaseState?.[KNOWLEDGE_STAGE_NAME]
				const isTest = stage === 'preview' || isDraft

				const execution: IXpertAgentExecution = {
									category: 'workflow',
									type: WorkflowNodeTypeEnum.UNDERSTANDING,
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
						const documentIds = value.map((v) => v.id)
						let documents: IKnowledgeDocument<ChunkMetadata>[] = []
						if (isTest) {
							const task = await this.taskService.findOne(knowledgeTaskId)
							documents = task.context.documents.filter((doc) => documentIds.includes(doc.id)) as IKnowledgeDocument<ChunkMetadata>[]
						} else {
							const results = await this.documentService.findAll({
								where: {
									id: In(documentIds),
									knowledgebaseId,
								},
								relations: ['pages']
							})
							documents = results.items
						}
						
						const strategy = await this.queryBus.execute<KnowledgeStrategyQuery, IImageUnderstandingStrategy>(
							new KnowledgeStrategyQuery({
								type: 'understanding',
								name: entity.provider
							})
						)

						const visionModel = entity.visionModel ? await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
							new CopilotModelGetChatModelQuery(
								null, entity.visionModel, {
										usageCallback: (token) => {
											// execution.tokens += (token ?? 0)
										}
									})
							) : null

						const permissions = await this.commandBus.execute(new PluginPermissionsCommand(strategy.permissions, {
									knowledgebaseId: knowledgebaseId,
									// folder: isDraft ? 'temp/' : '' // No need to specify a temp folder when reading files
								}))
						for await (const doc of documents) {
							const result = await strategy.understandImages({...doc, ...(doc.draft ?? {})},
								{
									...(entity.config ?? {}),
									stage: isDraft ? 'test' : 'prod',
									// tempDir: permissions.fileSystem.fullPath('tmp'),
									permissions,
									visionModel
								}
							)

							doc.chunks = result.chunks
							// if (result.pages) {
							// 	doc.pages = (doc.pages ?? []).concat(result.pages)
							// }
						}

						if (isTest) {
							await this.taskService.upsertDocuments(knowledgeTaskId, documents)
						} else {
							for await (const doc of documents) {
								if (doc.id) {
									// if (doc.pages?.length) {
									// 	await this.documentService.createPageBulk(doc.id, doc.pages)
									// }
									await this.documentService.update(doc.id, {
										metadata: doc.metadata,
										draft: {
											chunks: doc.chunks
										},
										status: KBDocumentStatusEnum.UNDERSTOOD
									})
								}
							}
						}

						return {
							state: {
								[channelName(node.key)]: {
									[DocumentsChannelName]: serializeDocuments(documents),
									[ErrorChannelName]: null
								}
							},
							output: documents.map((doc) => {
								doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
								// doc.pages = doc.pages?.slice(0, 2)
								return doc
							}) as unknown as JSONValue
						}
					}, {
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution,
						catchError: async (error) => {
							if (!isTest) {
								for await (const {id} of value) {
									await this.documentService.update(id, { status: KBDocumentStatusEnum.ERROR, processMsg: getErrorMessage(error) })
								}
								await this.taskService.update(knowledgeTaskId, { status: 'failed', error: getErrorMessage(error) })
							}
						}
					})()
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
			createDocumentsParameter(DocumentsChannelName),
			{
				type: XpertParameterTypeEnum.STRING,
				name: ErrorChannelName,
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			},
		]
	}
}
