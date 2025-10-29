import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IWFNProcessor,
	IWorkflowNode,
	IXpertAgentExecution,
	JSONValue,
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
import { getErrorMessage, shortuuid } from '@metad/server-common'
import { Inject, Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgebaseTaskService } from '../../task'
import { createDocumentsParameter, DOCUMENTS_CHANNEL_NAME, ERROR_CHANNEL_NAME, serializeDocuments } from '../types'


@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.PROCESSOR)
export class WorkflowProcessorNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.PROCESSOR,
		label: {
			en_US: 'Processor',
			zh_Hans: '处理器'
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

	@Inject(KnowledgebaseService)
	private readonly knowledgebaseService: KnowledgebaseService

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
		const entity = node.entity as IWFNProcessor

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable

				const stateEnv = stateWithEnvironment(state, environment)
				
				const value = get(stateEnv, entity.input) as Partial<IKnowledgeDocument>[]
				const knowledgebaseState = state[KnowledgebaseChannel]
				const knowledgebaseId = knowledgebaseState?.['knowledgebaseId'] as string
				const knowledgeTaskId = knowledgebaseState?.[KnowledgeTask] as string
				const stage = knowledgebaseState?.['stage']
				const isTest = stage === 'preview' || isDraft

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.PROCESSOR,
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
						let input: Partial<IKnowledgeDocument>[] = null
						const documentIds = value.map((v) => v.id)
						if (isTest) {
							const task = await this.taskService.findOne(knowledgeTaskId)
							const documents = task.context.documents.filter((doc) => documentIds.includes(doc.id))
							input = documents
						} else {
							const { items } = await this.documentService.findAll({
								where: {
									id: In(documentIds),
								},
								relations: ['chunks']
							})
							input = items
						}
						
						const results = await this.knowledgebaseService.transformDocuments(
							knowledgebaseId,
							entity,
							isDraft,
							input.map((doc) => ({
								...doc,
								...(doc.draft ?? {}),
							}))
						)

						let documents = []
						// Update knowledge task progress
						if (isTest) {
							documents = results.map((result) => {
								return {
									id: result.id || shortuuid(),
									chunks: result.chunks,
									metadata: result.metadata
								} as unknown as IKnowledgeDocument
							})
							await this.taskService.upsertDocuments(knowledgeTaskId, documents)
						} else {
							for await (const result of results) {
								if (result.id) {
									await this.documentService.update(result.id, {
										draft: {
											chunks: result.chunks
										},
										metadata: result.metadata,
										status: KBDocumentStatusEnum.TRANSFORMED
									})
									documents.push(result)
								} else {
									const doc = await this.documentService.create({
										metadata: result.metadata,
										// pages: result.chunks.map((chunk) => ({
										// 	pageContent: chunk.pageContent,
										// 	metadata: chunk.metadata
										// })),
										draft: {
											chunks: result.chunks
										},
										knowledgebaseId,
										status: KBDocumentStatusEnum.TRANSFORMED,
										tasks: [
											{
												id: knowledgeTaskId
											}
										]
									})
									documents.push(doc)
								}
							}
						}

						return {
							state: {
								[channelName(node.key)]: {
									[DOCUMENTS_CHANNEL_NAME]: serializeDocuments(documents),
									[ERROR_CHANNEL_NAME]: null
								}
							},
							output: results.map((doc) => {
									doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
									// doc.pages = doc.pages?.slice(0, 2)
									return doc
								}) as JSONValue
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
					}
				)()
			}),
			ends: [],
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
