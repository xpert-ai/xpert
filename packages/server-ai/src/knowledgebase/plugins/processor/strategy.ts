import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { Annotation, BaseChannel } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IKnowledgeDocument,
	IWFNProcessor,
	IWorkflowNode,
	IXpertAgentExecution,
	KBDocumentStatusEnum,
	KnowledgebaseChannel,
	KnowledgeTask,
	STATE_VARIABLE_FILES,
	STATE_VARIABLE_HUMAN,
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
import { IWorkflowNodeStrategy, TDocumentTransformerFile, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { In } from 'typeorm'
import { KnowledgeDocumentService } from '../../../knowledge-document'
import { AgentStateAnnotation, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgebaseTaskService } from '../../task'

const ErrorChannelName = 'error'
const DocumentsChannelName = 'documents'

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.PROCESSOR)
export class WorkflowProcessorNodeStrategy implements IWorkflowNodeStrategy {
	readonly meta = {
		name: WorkflowNodeTypeEnum.PROCESSOR,
		label: {
			en_US: 'Processor',
			zh_Hans: '处理器'
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
	}): { name?: string; graph: Runnable; ends: string[]; channel: { name: string; annotation: BaseChannel } } {
		const { graph, node, xpertId, environment, isDraft } = payload
		const entity = node.entity as IWFNProcessor

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable

				const stateEnv = stateWithEnvironment(state, environment)
				let input: string | string[] | TDocumentTransformerFile[] = null
				const value = get(stateEnv, entity.input)
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
						// const humanFilesName = `${STATE_VARIABLE_HUMAN}.${STATE_VARIABLE_FILES}`
						// const files: TDocumentTransformerFile[] = []
						// if (entity.input === humanFilesName) {
						// 	const storageFiles = await this.queryBus.execute<GetStorageFileQuery, IStorageFile[]>(
						// 		new GetStorageFileQuery(value.map((file) => file.id))
						// 	)
						// 	for (const file of storageFiles) {
						// 		const extname = file.originalName?.split('.').pop()?.toLowerCase()
						// 		files.push({
						// 			fileUrl: file.fileUrl,
						// 			filePath: file.file,
						// 			filename: file.originalName,
						// 			extname
						// 		})
						// 	}
						// 	input = files
						// } else {
						if (isTest) {
							const task = await this.taskService.findOne(knowledgeTaskId)
							const documents = task.context.documents.filter((doc) => value.includes(doc.id))
							input = documents.map(
								(doc) =>
									({
										id: doc.id,
										fileUrl: doc.fileUrl,
										filePath: doc.filePath,
										filename: doc.name,
										extname: doc.name?.split('.').pop()?.toLowerCase()
									}) as TDocumentTransformerFile
							)
						} else {
							const { items } = await this.documentService.findAll({
								where: {
									id: In(value)
								}
							})

							input = items.map(
								(doc) =>
									({
										id: doc.id,
										fileUrl: doc.fileUrl,
										filePath: doc.filePath,
										filename: doc.name,
										extname: doc.name?.split('.').pop()?.toLowerCase()
									}) as TDocumentTransformerFile
							)
						}
						// }

						console.log('Processor input:', input)
						
						const results = await this.knowledgebaseService.transformDocuments(
							knowledgebaseId,
							entity,
							isDraft,
							input
						)

						// console.log(JSON.stringify(results, null, 2))

						const documentIds = []
						// Update knowledge task progress
						if (isTest) {
							const documents = results.map((result) => {
								return {
									id: result.id || shortuuid(),
									chunks: result.chunks,
									metadata: result.metadata
								} as unknown as IKnowledgeDocument
							})
							await this.taskService.upsertDocuments(knowledgeTaskId, documents)
							documentIds.push(...documents.map((doc) => doc.id))
						} else {
							for await (const result of results) {
								if (result.id) {
									await this.documentService.update(result.id, {
										metadata: result.metadata,
										chunks: result.chunks
									})
									documentIds.push(result.id)
								} else {
									const doc = await this.documentService.create({
										metadata: result.metadata,
										pages: result.chunks.map((chunk) => ({
											pageContent: chunk.pageContent,
											metadata: chunk.metadata
										})),
										knowledgebaseId,
										tasks: [
											{
												id: knowledgeTaskId
											}
										]
									})
									documentIds.push(doc.id)
								}
							}
						}

						return {
							state: {
								[channelName(node.key)]: {
									[DocumentsChannelName]: documentIds
								}
							},
							output: JSON.stringify(
								results.map((doc) => {
									doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
									// doc.pages = doc.pages?.slice(0, 2)
									return doc
								}),
								null,
								2
							)
						}
					},
					{
						commandBus: this.commandBus,
						queryBus: this.queryBus,
						subscriber: subscriber,
						execution,
						catchError: async (error) => {
							if (!isTest) {
								for await (const id of value) {
									await this.documentService.update(id, { status: KBDocumentStatusEnum.ERROR, processMsg: getErrorMessage(error) })
								}
							}
						}
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
				name: ErrorChannelName,
				title: 'Error',
				description: {
					en_US: 'Error info',
					zh_Hans: '错误信息'
				}
			},
			{
				type: XpertParameterTypeEnum.ARRAY_STRING,
				name: DocumentsChannelName,
				title: 'Documents',
				description: {
					en_US: 'Document IDs',
					zh_Hans: '文档IDs'
				}
			}
		]
	}
}
