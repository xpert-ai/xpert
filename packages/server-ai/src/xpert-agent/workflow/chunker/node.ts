import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNChunker,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ITextSplitterStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { KnowledgebaseTaskService, KnowledgeStrategyQuery, KnowledgeTaskServiceQuery } from '../../../knowledgebase'
import { AgentStateAnnotation, nextWorkflowNodes, stateWithEnvironment } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

const ErrorChannelName = 'error'
const DocumentsChannelName = 'documents'

export function createChunkerNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
	}
) {
	const { commandBus, queryBus, environment } = params
	const entity = node.entity as IWFNChunker

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, knowledgeTaskId } =
					configurable
				const stateEnv = stateWithEnvironment(state, environment)
				const value = get(stateEnv, entity.input) as string[]

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

						console.log('Chunker input value:', value)

						const taskService = await queryBus.execute<KnowledgeTaskServiceQuery, KnowledgebaseTaskService>(
							new KnowledgeTaskServiceQuery()
						)
						const task = await taskService.findOne(knowledgeTaskId)

						const documents = task.context.documents.filter((doc) => value.includes(doc.id))

						console.log('Chunker documents:', documents)

						const strategy = await queryBus.execute<KnowledgeStrategyQuery, ITextSplitterStrategy>(
							new KnowledgeStrategyQuery({
								type: 'chunker',
								name: entity.provider
							})
						)

						for await (const doc of documents) {
							const result = await strategy.splitDocuments(doc.chunks, entity.config)
							doc.chunks = result.chunks
							doc.pages = result.pages

							console.log('Chunker result chunks:', result.chunks)
						}

						await taskService.upsertDocuments(knowledgeTaskId, documents)

						return {
							state: {
								[channelName(node.key)]: {
									[DocumentsChannelName]: documents.map((doc) => doc.id)
								}
							},
							output: JSON.stringify(documents.map((doc) => {
								doc.chunks = doc.chunks?.slice(0, 2) // only return first 2 chunks for preview
								doc.pages = doc.pages?.slice(0, 2)
								return doc
							}), null, 2)
						}
					},
					{
						commandBus: commandBus,
						queryBus: queryBus,
						subscriber: subscriber,
						execution
					})()
			}),
			ends: []
		},
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
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			if (state[channelName(node.key)][ErrorChannelName]) {
				return (
					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
					END
				)
			}

			return nextWorkflowNodes(graph, node.key, state)
		}
	}
}

export function chunkerOutputVariables(entity: IWorkflowNode) {
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
