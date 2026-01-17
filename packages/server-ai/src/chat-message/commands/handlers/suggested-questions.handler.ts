import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { mapTranslationLanguage } from '@metad/contracts'
import { nonNullable, stringifyMessageContent } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { z } from 'zod'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { XpertCopilotNotFoundException } from '../../../core'
import { ChatMessageService } from '../../chat-message.service'
import { SUGGESTED_QUESTIONS_PROMPT, SUGGESTED_QUESTIONS_SCHEMA } from '../../types'
import { SuggestedQuestionsCommand } from '../suggested-questions.command'

@CommandHandler(SuggestedQuestionsCommand)
export class SuggestedQuestionsHandler implements ICommandHandler<SuggestedQuestionsCommand> {
	constructor(
		private readonly service: ChatMessageService,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: SuggestedQuestionsCommand) {
		const { messageId } = command.params
		const message = await this.service.findOne(messageId, {
			relations: [
				'conversation',
				'conversation.xpert',
				'conversation.xpert.copilotModel',
				'conversation.xpert.copilotModel.copilot',
				'conversation.messages'
			]
		})

		const messages = message.conversation.messages

		const xpert = message.conversation.xpert

		if (!xpert.features?.suggestion?.enabled) {
			return []
		}

		const instruction = xpert.features.suggestion.prompt?.trim() || SUGGESTED_QUESTIONS_PROMPT
		const copilotModel = xpert.copilotModel
		if (!copilotModel?.model || !copilotModel?.copilotId) {
			throw new XpertCopilotNotFoundException(
				await this.i18nService.t('xpert.Error.XpertBasicModelNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilotModel.copilot, copilotModel, {
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

		// Use functionCalling method instead of default JSON mode
		// because some providers (e.g. DeepSeek) don't support response_format parameter
		const structuredOutput = chatModel.withStructuredOutput<{
			questions: string[]
		}>(
			z.object({
				questions: z.array(z.string().describe('Suggested Question')).max(5, 'Maximum 5 questions')
			}),
			{ method: 'functionCalling' }
		)
		const output = await prompt.pipe(structuredOutput).invoke([])

		return output.questions
	}
}
