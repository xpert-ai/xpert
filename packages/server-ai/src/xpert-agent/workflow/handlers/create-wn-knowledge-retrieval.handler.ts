import { DocumentInterface } from '@langchain/core/documents'
import { RunnableLambda } from '@langchain/core/runnables'
import { END, Send } from '@langchain/langgraph'
import { channelName, IWFNKnowledgeRetrieval, IXpertAgentExecution, TAgentRunnableConfigurable } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import { get } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { wrapAgentExecution } from '../../../xpert-agent-execution/utils'
import { AgentStateAnnotation, stateToParameters } from '../../commands/handlers/types'
import { CreateWNAnswerCommand } from '../create-wn-answer.command'
import { CreateWNKnowledgeRetrievalCommand } from '../create-wn-knowledge-retrieval.command'

@CommandHandler(CreateWNKnowledgeRetrievalCommand)
export class CreateWNKnowledgeRetrievalHandler implements ICommandHandler<CreateWNKnowledgeRetrievalCommand> {
	readonly #logger = new Logger(CreateWNKnowledgeRetrievalHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateWNAnswerCommand) {
		const { graph, node } = command
		const { environment } = command.options

		const entity = node.entity as IWFNKnowledgeRetrieval

		const retriever = createWorkflowRetriever(this.queryBus, entity)
		return {
			workflowNode: {
				graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
					const configurable: TAgentRunnableConfigurable = config.configurable
					const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable

					const query = get(stateToParameters(state, environment), entity.queryVariable)

					const execution: IXpertAgentExecution = {
						inputs: { query },
						parentId: executionId,
						threadId: thread_id,
						checkpointNs: checkpoint_ns,
						checkpointId: checkpoint_id,
						agentKey: node.key,
						title: entity.title
					}

					return await wrapAgentExecution(
						async () => {
							const documents = (await retriever?.invoke(query)) ?? []

							return {
								state: {
									[channelName(node.key)]: {
										result: JSON.stringify(documents, null, 2)
									}
								},
								output: getFirstTwoDocs(documents)
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
				ends: []
			},
			navigator: async (state: typeof AgentStateAnnotation.State, config) => {
				const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === node.key)
				return connections.length > 0 ? connections.map((conn) => new Send(conn.to, state)) : END
			}
		}
	}
}

export function createWorkflowRetriever(queryBus: QueryBus, entity: IWFNKnowledgeRetrieval) {
	const retrievers = entity.knowledgebases?.map((id) => ({
		retriever: createKnowledgeRetriever(queryBus, id, entity?.recall ?? {}),
		weight: entity?.recall?.weight
	}))
	const retriever = retrievers?.length
		? new EnsembleRetriever({
				retrievers: retrievers.map(({ retriever }) => retriever),
				weights: retrievers.map(({ weight }) => weight ?? 0.5)
			})
		: null
	return retriever
}

function getFirstTwoDocs(documents: DocumentInterface[]): string {
	if (documents.length <= 2) {
		return JSON.stringify(documents, null, 2)
	}
	return JSON.stringify(documents.slice(0, 2), null, 2) + '\n...'
}
