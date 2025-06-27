import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { filterMessageText } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { GetChatConversationQuery } from '../../../chat-conversation'
import { CopilotGetOneQuery } from '../../../copilot'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { cleanMarkdownForSpeech } from '../../../shared'
import { FindXpertQuery } from '../../../xpert'
import { SynthesizeCommand } from '../synthesize.command'

@CommandHandler(SynthesizeCommand)
export class SynthesizeHandler implements ICommandHandler<SynthesizeCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: SynthesizeCommand) {
		const { conversationId, messageId, isDraft, signal } = command.params

		const conversation = await this.queryBus.execute(
			new GetChatConversationQuery({ id: conversationId }, ['messages'])
		)
		const message = conversation.messages.find((_) => _.id === messageId)

		if (!message) {
			throw new Error('Message not found')
		}

		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: conversation.xpertId }, { isDraft }))

		const copilotModel = xpert.features?.textToSpeech?.copilotModel
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
		const text = filterMessageText(message.content)
		return await chatModel.stream(cleanMarkdownForSpeech(text), {
			signal
		})
	}
}
