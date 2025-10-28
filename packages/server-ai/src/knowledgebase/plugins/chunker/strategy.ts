import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IWFNChunker,
	IWorkflowNode,
	IXpertAgentExecution,
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
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ITextSplitterStrategy, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { AgentStateAnnotation, deepTransformValue, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgeStrategyQuery } from '../../queries'
import { KnowledgebaseTaskService } from '../../task'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { createDocumentsParameter, DOCUMENTS_CHANNEL_NAME, ERROR_CHANNEL_NAME, serializeDocuments } from '../types'
import { PromptTemplate } from '@langchain/core/prompts'


@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.CHUNKER)
export class WorkflowChunkerNodeStrategy implements IWorkflowNodeStrategy {
	readonly logger = new Logger(WorkflowChunkerNodeStrategy.name)

	readonly meta = {
		name: WorkflowNodeTypeEnum.CHUNKER,
		label: {
			en_US: 'Chunker',
			zh_Hans: '分块器'
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
		const entity = node.entity as IWFNChunker

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } =
					configurable
				const stateEnv = stateWithEnvironment(state, environment)
				const value = get(stateEnv, entity.input) as Partial<IKnowledgeDocument>[]
				const knowledgebaseState = state[KnowledgebaseChannel]
				const knowledgebaseId = knowledgebaseState?.['knowledgebaseId'] as string
				const knowledgeTaskId = knowledgebaseState?.[KnowledgeTask] as string
				const stage = knowledgebaseState?.[KNOWLEDGE_STAGE_NAME]
				const isTest = stage === 'preview' || isDraft

				if (!entity.input) {
					throw new Error('Chunker node input is not defined')
				}

				const execution: IXpertAgentExecution = {
									category: 'workflow',
									type: WorkflowNodeTypeEnum.CHUNKER,
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
						this.logger.debug('Chunker input value:', entity.input, value)
						if (!Array.isArray(value)) {
							throw new Error('Chunker node input value is not an array')
						}

						const documentIds = value.map((v) => v.id)
						let documents = []
						if (isTest) {
							const task = await this.taskService.findOne(knowledgeTaskId)
							documents = task.context.documents.filter((doc) => documentIds.includes(doc.id))
						} else {
							const results = await this.documentService.findAll({
								where: {
									id: In(documentIds),
									knowledgebaseId,
								},
								relations: ['chunks']
							})
							documents = results.items
						}

						const strategy = await this.queryBus.execute<KnowledgeStrategyQuery, ITextSplitterStrategy>(
							new KnowledgeStrategyQuery({
								type: 'chunker',
								name: entity.provider
							})
						)

						// Transform parameters with state
						const parameters = entity.config ? await deepTransformValue(entity.config, async (v) => {
													return await PromptTemplate.fromTemplate(v, { templateFormat: 'mustache' }).format(stateEnv)
												}) : {}

						for await (const doc of documents) {
							const chunks = []
							const splitDocs = [];
							doc.draft?.chunks?.forEach((chunk) => {
								// only chunk text chunks
								if (chunk.metadata.mediaType !== 'image') {
									splitDocs.push(chunk)
								} else {
									chunks.push(chunk)
								}
							})
							if (!splitDocs?.length) {
								continue
							}
							
							const result = await strategy.splitDocuments(splitDocs, parameters)
							if (result?.chunks) {
								chunks.push(...result.chunks)
							}
							doc.chunks = chunks
							if (!isTest) {
								// if (result.pages?.length) {
								// 	await this.documentService.createPageBulk(doc.id, result.pages)
								// }
								await this.documentService.update(doc.id, {draft: { chunks }, status: KBDocumentStatusEnum.SPLITTED })
							}
						}

						if (isTest) {
						  await this.taskService.upsertDocuments(knowledgeTaskId, documents)
						}

						return {
							state: {
								[channelName(node.key)]: {
									[DOCUMENTS_CHANNEL_NAME]: serializeDocuments(documents),
									[ERROR_CHANNEL_NAME]: null
								}
							},
							output: documents.map((doc) => {
								doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
								// doc.pages = doc.pages?.slice(0, 2)
								return doc
							})
						}
					},
					{
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
			createDocumentsParameter(),
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
