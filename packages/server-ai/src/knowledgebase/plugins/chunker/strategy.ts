import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IWFNChunker,
	IWorkflowNode,
	IXpertAgentExecution,
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
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ITextSplitterStrategy, IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgeStrategyQuery } from '../../queries'
import { KnowledgebaseTaskService } from '../../task'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { createDocumentsParameter, DOCUMENTS_CHANNEL_NAME, ERROR_CHANNEL_NAME, serializeDocuments } from '../types'


@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.CHUNKER)
export class WorkflowChunkerNodeStrategy implements IWorkflowNodeStrategy {
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

				// console.log('================== Chunker Node state ===================')
				// console.log(JSON.stringify(state, null, 2))
				// console.log('================== Chunker Node End ===================')

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
						console.log('Chunker input value:', entity.input, value)
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
								relations: ['pages']
							})
							documents = results.items
						}

						const strategy = await this.queryBus.execute<KnowledgeStrategyQuery, ITextSplitterStrategy>(
							new KnowledgeStrategyQuery({
								type: 'chunker',
								name: entity.provider
							})
						)

						for await (const doc of documents) {
							const result = await strategy.splitDocuments(doc.chunks ?? doc.pages, entity.config)
							doc.chunks = result.chunks
							doc.pages = result.pages
							// console.log('Chunker result chunks:', result.chunks)
							if (!isTest) {
								await this.documentService.update(doc.id, { chunks: doc.chunks, pages: doc.pages })
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
								doc.pages = doc.pages?.slice(0, 2)
								return doc
							})
						}
					},
					{
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution
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
