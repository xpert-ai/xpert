import { AIMessagePromptTemplate } from '@langchain/core/prompts'
import { END, LangGraphRunnableConfig, Send } from '@langchain/langgraph'
import { IWFNAnswer } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { FakeStreamingChatModel } from '../../agent'
import { CreateWNAnswerCommand } from '../create-wn-answer.command'
import { AgentStateAnnotation, stateToParameters } from './types'

@CommandHandler(CreateWNAnswerCommand)
export class CreateWNAnswerHandler implements ICommandHandler<CreateWNAnswerCommand> {
	readonly #logger = new Logger(CreateWNAnswerHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: CreateWNAnswerCommand) {
		const { graph, node } = command

		const entity = node.entity as IWFNAnswer

		return {
			workflowNode: {
				graph: async (state: typeof AgentStateAnnotation.State, config: LangGraphRunnableConfig) => {

					const aiMessage = await AIMessagePromptTemplate.fromTemplate(entity.promptTemplate, {
						templateFormat: 'mustache'
					}).format(stateToParameters(state))

					await new FakeStreamingChatModel({ responses: [aiMessage] }).invoke([], config)
				},
				ends: []
			},
			navigator: async (state: typeof AgentStateAnnotation.State, config) => {
				const connections = graph.connections.filter((conn) => conn.type === 'edge' && conn.from === node.key)
				return connections.length > 0 ? connections.map((conn) => new Send(conn.to, state)) : END
			}
		}
	}
}
