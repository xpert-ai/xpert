import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNProcessor,
	IWorkflowNode,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IDocumentTransformerStrategy } from '@xpert-ai/plugin-sdk'
import { get } from 'lodash'
import { KnowledgeStrategyQuery, KnowledgeTaskServiceQuery } from '../../../knowledgebase/queries'
import { AgentStateAnnotation, nextWorkflowNodes, stateWithEnvironment } from '../../../shared'
import { KnowledgebaseTaskService } from '../../../knowledgebase'
import { shortuuid } from '@metad/server-common'

const ErrorChannelName = 'error'
const DocumentsChannelName = 'documents'

export function createProcessorNode(
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
	const entity = node.entity as IWFNProcessor

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, knowledgebaseId, knowledgeTaskId } =
					configurable
				const stateEnv = stateWithEnvironment(state, environment)
				// const value = await PromptTemplate.fromTemplate(entity.input, {templateFormat: 'mustache'}).format(stateEnv)

				// const variable = entity.input.replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
				const value = get(stateEnv, entity.input)

				const strategy = await queryBus.execute<KnowledgeStrategyQuery, IDocumentTransformerStrategy>(
					new KnowledgeStrategyQuery({
						type: 'processor',
						name: entity.provider
					})
				)

				if (!strategy) {
					throw new Error(`Processor strategy ${entity.provider} not found`)
				}

				const results = await strategy.transformDocuments(value, entity.config)

				console.log(JSON.stringify(results, null, 2))

				// Update knowledge task progress
				const taskService = await queryBus.execute<KnowledgeTaskServiceQuery, KnowledgebaseTaskService>(new KnowledgeTaskServiceQuery())

				const documents = results.map((result) => {
					return {
						id: shortuuid(),
						chunks: result.chunks,
						metadata: result.metadata
					}
				})
				await taskService.upsertDocuments(knowledgeTaskId, documents)

				return {
					[channelName(node.key)]: {
						[DocumentsChannelName]: documents.map((result) => result.id)
					}
				}
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

export function processorOutputVariables(entity: IWorkflowNode) {
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
				en_US: 'Documents IDs',
				zh_Hans: '文档IDs'
			}
		}
	]
}
