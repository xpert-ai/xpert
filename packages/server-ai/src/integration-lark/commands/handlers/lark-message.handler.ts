import { RequestContext } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../../chat/message'
import { LarkConversationService } from '../../conversation.service'
import { LarkChatAgentCommand } from '../chat-agent.command'
import { LarkChatXpertCommand } from '../chat-xpert.command'
import { LarkMessageCommand } from '../mesage.command'

@CommandHandler(LarkMessageCommand)
export class LarkMessageHandler implements ICommandHandler<LarkMessageCommand> {
	constructor(
		private readonly conversationService: LarkConversationService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: LarkMessageCommand): Promise<unknown> {
		const { input } = command
		const { integration, message } = input

		if (integration.options?.xpertId) {
			const { content } = message.message
			const textContent = JSON.parse(content)
			const text = textContent.text as string

			const userId = RequestContext.currentUserId()

			const larkMessage = new ChatLarkMessage(
				input,
				{
					xpertId: integration.options.xpertId,
					userId,
					text
				},
				this.conversationService
			)

			return await this.commandBus.execute(
				new LarkChatXpertCommand(integration.options.xpertId, text, larkMessage)
			)
		}

		return await this.commandBus.execute(new LarkChatAgentCommand(input))
	}
}
