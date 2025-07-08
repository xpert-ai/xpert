import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { nonNullable, stringifyMessageContent } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import { CopilotGetOneQuery } from '../../../copilot'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { ChatMessageService } from '../../chat-message.service'
import { SUGGESTED_QUESTIONS_PROMPT, SUGGESTED_QUESTIONS_SCHEMA } from '../../types'
import { SuggestedQuestionsCommand } from '../suggested-questions.command'

@CommandHandler(SuggestedQuestionsCommand)
export class SuggestedQuestionsHandler implements ICommandHandler<SuggestedQuestionsCommand> {
	constructor(
		private readonly service: ChatMessageService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: SuggestedQuestionsCommand) {
		const { messageId } = command.params
		const message = await this.service.findOne(messageId, {
			relations: ['conversation', 'conversation.xpert', 'conversation.messages']
		})

		const messages = message.conversation.messages

		const xpert = message.conversation.xpert

		if (!xpert.features?.suggestion?.enabled) {
			return []
		}

		const instruction = xpert.features.suggestion.prompt?.trim() || SUGGESTED_QUESTIONS_PROMPT
		const copilotModel = message.conversation.xpert.copilotModel
		const copilotId = copilotModel?.copilotId
		const copilot = await this.queryBus.execute(
			new CopilotGetOneQuery(RequestContext.currentTenantId(), copilotId, ['copilotModel'])
		)
		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, copilotModel, {
				abortController: new AbortController(),
				usageCallback: null
			})
		)
		const prompt = ChatPromptTemplate.fromMessages(
			[
				...messages
					.map((message) => {
						if (message.role === 'human') {
							return new HumanMessage(stringifyMessageContent(message.content))
						} else if (message.role === 'ai') {
							return new AIMessage(stringifyMessageContent(message.content))
						}
						return null
					})
					.filter(nonNullable),
				['human', instruction + SUGGESTED_QUESTIONS_SCHEMA]
			],
			{
				templateFormat: 'mustache'
			}
		)
		const output = await prompt
			.pipe(
				chatModel.withStructuredOutput(
					z.object({
						questions: z.array(z.string().describe('Suggested Question')).max(5, 'Maximum 5 questions')
					})
				)
			)
			.invoke([])

		return output.questions
	}
}
