import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IKnowledgeDocumentChunk,
	IWFNKnowledgeBase,
	IWorkflowNode,
	IXpertAgentExecution,
	KBDocumentStatusEnum,
	KnowledgebaseChannel,
	KnowledgeTask,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { estimateTokenUsage } from '@metad/copilot'
import { getErrorMessage, runWithConcurrencyLimit } from '@metad/server-common'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { CopilotTokenRecordCommand } from '../../../copilot-user'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeDocumentStore } from '../../vector-store'
import { KnowledgebaseTaskService } from '../../task'
import { ERROR_CHANNEL_NAME } from '../types'
import { TDocChunkMetadata } from '../../../knowledge-document/types'


const InfoChannelName = 'info'
const TaskChannelName = 'task'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.KNOWLEDGE_BASE)
export class WorkflowKnowledgeBaseNodeStrategy implements IWorkflowNodeStrategy {
	private readonly logger = new Logger(WorkflowKnowledgeBaseNodeStrategy.name)

	readonly meta = {
		name: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
		label: {
			en_US: 'Knowledge Base',
			zh_Hans: '知识库'
		},
		icon: null,
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	@Inject(KnowledgebaseService)
	private readonly knowledgebaseService: KnowledgebaseService

	@Inject(KnowledgeDocumentService)
	private readonly documentService: KnowledgeDocumentService

	@Inject(KnowledgebaseTaskService)
	private readonly taskService: KnowledgebaseTaskService

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
		const entity = node.entity as IWFNKnowledgeBase

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, userId, executionId } = configurable
				const stateEnv = stateWithEnvironment(state, environment)
				const knowledgebaseState = state[KnowledgebaseChannel]
				const knowledgebaseId = knowledgebaseState?.['knowledgebaseId'] as string
				const knowledgeTaskId = knowledgebaseState?.[KnowledgeTask] as string
				const stage = knowledgebaseState?.['stage']
				const isTest = stage === 'preview' || isDraft

				const values = entity.inputs.map((input) => get(stateEnv, input)) as Partial<IKnowledgeDocument[]>[]
				const inputDocuments = values.filter((docs) => !!docs).flat()

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
					inputs: inputDocuments,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						let statisticsInformation = ''

						if (isTest) {
							await this.taskService.update(knowledgeTaskId, {status: 'success'})
							statisticsInformation += `- This is a test run, no documents were processed. \n`
							return {
								state: {
									[channelName(node.key)]: {
										[InfoChannelName]: statisticsInformation.trim(),
										[TaskChannelName]: {
											status: 'success',
										}
									}
								},
								output: statisticsInformation.trim()
							}
						}

						const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
							relations: ['copilotModel', 'copilotModel.copilot']
						})

						let vectorStore: KnowledgeDocumentStore
						try {
							vectorStore = await this.knowledgebaseService.getVectorStore(knowledgebase, true)
						} catch (err) {
							statisticsInformation += `- Error initializing vector store: ${getErrorMessage(err)} \n`
							// return {
							// 	state: {
							// 		[channelName(node.key)]: {
							// 			error: `Knowledge base error: ${getErrorMessage(err)}`,
							// 			[InfoChannelName]: statisticsInformation.trim(),
							// 			[TaskChannelName]: {
							// 				status: 'error',
							// 			}
							// 		}
							// 	}
							// }
							throw new Error(`Error initializing vector store: ${getErrorMessage(err)}`)
						}

						const { items: documents } = await this.documentService.findAll({
							where: {
								id: In(inputDocuments.map(({id}) => id) as string[]),
								knowledgebaseId
							},
							// relations: ['chunks']
						})
						
						const tasks = documents.map((document, index) => async () => {
							statisticsInformation += `- Document ${index + 1} - ${document.name}: \n`
							try {
								// Save pages into db, And associated with the chunk's metadata.
								let chunks = document.draft?.chunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
								// if (document?.pages?.length) {
								// 	const pages = document?.pages
								// 	chunks = chunks.map((chunk) => {
								// 		const page = pages.find((p) => p.metadata.chunkId === chunk.metadata.parentId)
								// 		if (page) {
								// 			chunk.metadata.pageId = page.id
								// 		}
								// 		return chunk
								// 	})
								// }

								if (chunks) {
									this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
									document.chunks = await this.documentService.coverChunks({...document, chunks}, vectorStore)
									await this.documentService.update(document.id, { status: KBDocumentStatusEnum.EMBEDDING, progress: 0, draft: null })
									chunks = await this.documentService.findAllEmbeddingNodes(document)

									// Clear history chunks
									await vectorStore.deleteKnowledgeDocument(document)

									const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
									let count = 0
									while (batchSize * count < chunks.length) {
										const batch = chunks.slice(batchSize * count, batchSize * (count + 1))
										// Record token usage
										const tokenUsed = batch.reduce(
											(total, doc) => total + estimateTokenUsage(doc.pageContent),
											0
										)
										await this.commandBus.execute(
											new CopilotTokenRecordCommand({
												tenantId: knowledgebase.tenantId,
												organizationId: knowledgebase.organizationId,
												userId,
												copilotId: knowledgebase.copilotModel.copilot.id,
												tokenUsed,
												model: vectorStore.embeddingModel
											})
										)
										await vectorStore.addKnowledgeDocument(document, batch)
										count++
										const progress =
											batchSize * count >= chunks.length
												? 100
												: (((batchSize * count) / chunks.length) * 100).toFixed(1)
										this.logger.debug(
											`Embeddings document '${document.name}' progress: ${progress}%`
										)
										if (await this.checkIfJobCancelled(document.id)) {
											throw KBDocumentStatusEnum.CANCEL
										}
										await this.documentService.update(document.id, { progress: Number(progress) })
									}
								}
								await this.documentService.update(document.id, {
									status: KBDocumentStatusEnum.FINISH,
									processMsg: ''
								})
								statisticsInformation += ` - Embedded ${chunks?.length || 0} chunks. \n`
							} catch (err) {
								if (err === KBDocumentStatusEnum.CANCEL) {
									statisticsInformation += ` - Cancelled by user. \n`
									return
								}
								this.documentService.update(document.id, {
									status: KBDocumentStatusEnum.ERROR,
									processMsg: getErrorMessage(err)
								})
								statisticsInformation += ` - Error: ${getErrorMessage(err)} \n`
							}
						})

						const results = await runWithConcurrencyLimit(tasks, 3)

						// Update task status
						await this.taskService.update(knowledgeTaskId, {
							status: 'success'
						})

						return {
							state: {
								[channelName(node.key)]: {
									[InfoChannelName]: statisticsInformation.trim(),
									[TaskChannelName]: {
											status: 'success',
										},
									[ERROR_CHANNEL_NAME]: null
								}
							}
						}
					},
					{
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution,
						catchError: async (error) => {
							if (!isTest) {
								for await (const {id} of inputDocuments) {
									await this.documentService.update(id, { status: KBDocumentStatusEnum.ERROR, processMsg: getErrorMessage(error) })
								}
								await this.taskService.update(knowledgeTaskId, { status: 'failed', error: getErrorMessage(error) })
							}
						}
					}
				)()
			}),
			ends: [],
		}
	}

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		return [
			{
				type: XpertParameterTypeEnum.STRING,
				name: ERROR_CHANNEL_NAME,
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			},
			{
				type: XpertParameterTypeEnum.STRING,
				name: InfoChannelName,
				title: 'Information',
				description: {
					en_US: 'Statistics Information',
					zh_Hans: '统计信息'
				}
			},
			{
				type: XpertParameterTypeEnum.OBJECT,
				name: TaskChannelName,
				title: 'Task',
				description: {
					en_US: 'Task Object',
					zh_Hans: '任务对象'
				},
				item: [
					{
						type: XpertParameterTypeEnum.STRING,
						name: 'status',
						title: 'Status',
						description: {
							en_US: 'Task Status',
							zh_Hans: '任务状态'
						},
						options: ['pending', 'processing', 'success', 'error', 'cancel'],
					}
				]
			}
		]
	}

	async checkIfJobCancelled(docId: string): Promise<boolean> {
		// Check database/cache for cancellation flag
		const doc = await this.documentService.findOne(docId, {select: ['status']})
		if (doc) {
			return doc?.status === KBDocumentStatusEnum.CANCEL
		}
		return true
	}
}
