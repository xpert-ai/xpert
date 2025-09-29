import { Document } from '@langchain/core/documents'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
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
import { ChunkMetadata, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { CopilotTokenRecordCommand } from '../../../copilot-user'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeDocumentStore } from '../../vector-store'
import { KnowledgebaseTaskService } from '../../task'

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
	}): { name?: string; graph: Runnable; ends: string[]; channel: { name: string; annotation: BaseChannel } } {
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

				const values = entity.inputs.map((input) => get(stateEnv, input))
				console.log('Knowledge Base Input:', entity.inputs, values)

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
					inputs: values,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						if (isTest) {
							await this.taskService.update(knowledgeTaskId, {status: 'success'})
							return {
								state: {}
							}
						}

						const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
							relations: ['copilotModel', 'copilotModel.copilot']
						})

						let vectorStore: KnowledgeDocumentStore
						try {
							vectorStore = await this.knowledgebaseService.getVectorStore(knowledgebase, true)
						} catch (err) {
							return {
								state: {
									[channelName(node.key)]: {
										error: `Knowledge base error: ${getErrorMessage(err)}`
									}
								}
							}
						}

						const { items: documents } = await this.documentService.findAll({
							where: {
								id: In(values.filter((ids) => !!ids).flat() as string[]),
								knowledgebaseId
							},
							relations: ['pages']
						})

						const tasks = documents.map((document, index) => async () => {
							try {
								// Save pages into db, And associated with the chunk's metadata.
								let chunks: Document<ChunkMetadata>[] = document?.chunks as Document<ChunkMetadata>[]
								if (document?.pages?.length) {
									const pages = document?.pages
									chunks = chunks.map((chunk) => {
										const page = pages.find((p) => p.metadata.chunkId === chunk.metadata.parentId)
										if (page) {
											chunk.metadata.pageId = page.id
										}
										return chunk
									})
								}

								if (chunks) {
									this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
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
											return
										}
										await this.documentService.update(document.id, { progress: Number(progress) })
									}
								}
								await this.documentService.update(document.id, {
									status: KBDocumentStatusEnum.FINISH,
									processMsg: ''
								})
							} catch (err) {
								this.documentService.update(document.id, {
									status: KBDocumentStatusEnum.ERROR,
									processMsg: getErrorMessage(err)
								})
							}
						})

						const results = await runWithConcurrencyLimit(tasks, 3)

						return {
							state: {
								[channelName(node.key)]: {}
							}
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
				name: 'error',
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			}
		]
	}

	async checkIfJobCancelled(docId: string): Promise<boolean> {
		// Check database/cache for cancellation flag
		const doc = await this.documentService.findOne(docId)
		if (doc) {
			return doc?.status === KBDocumentStatusEnum.CANCEL
		}
		return true
	}
}
