import { TIntegrationLarkOptions } from '@metad/contracts'
import { IntegrationService } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../../chat/message'
import { LarkConversationService } from '../../conversation.service'
import { LarkService } from '../../lark.service'
import { LarkChatAgentCommand } from '../chat-agent.command'
import { LarkChatXpertCommand } from '../chat-xpert.command'
import { LarkMessageCommand } from '../mesage.command'

@CommandHandler(LarkMessageCommand)
export class LarkMessageHandler implements ICommandHandler<LarkMessageCommand> {
	constructor(
		private readonly larkService: LarkService,
		private readonly conversationService: LarkConversationService,
		private readonly integrationService: IntegrationService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: LarkMessageCommand): Promise<unknown> {
		const { options } = command
		const { userId, integrationId, message, input } = options
		const integration = await this.integrationService.findOneByIdString(integrationId)

		if (integration.options?.xpertId) {
			let text = input
			if (!text && message) {
				const { content } = message.message
				const textContent = JSON.parse(content)
				text = textContent.text as string
			}

			// Conversation last message
			const lastMessage = await this.conversationService.getLastMessage(userId, integration.options.xpertId)

			const larkMessage = new ChatLarkMessage(
				{ ...options, larkService: this.larkService },
				{
					text,
					language:
						lastMessage?.thirdPartyMessage?.language ||
						(<TIntegrationLarkOptions>integration.options)?.preferLanguage
				}
			)

			return await this.commandBus.execute(
				new LarkChatXpertCommand(integration.options.xpertId, text, larkMessage)
			)
		}

		return await this.commandBus.execute(new LarkChatAgentCommand(options))
	}
}
