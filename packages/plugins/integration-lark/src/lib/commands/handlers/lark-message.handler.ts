import { TIntegrationLarkOptions } from '@metad/contracts'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	PluginContext,
} from '@xpert-ai/plugin-sdk'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../../chat/message'
import { LarkConversationService } from '../../conversation.service'
import { LarkService } from '../../lark.service'
import { LARK_PLUGIN_CONTEXT } from '../../tokens'
import { LarkChatXpertCommand } from '../chat-xpert.command'
import { LarkMessageCommand } from '../mesage.command'

@CommandHandler(LarkMessageCommand)
export class LarkMessageHandler implements ICommandHandler<LarkMessageCommand> {
	private _integrationPermissionService: IntegrationPermissionService

	constructor(
		private readonly larkService: LarkService,
		private readonly conversationService: LarkConversationService,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext,
		private readonly commandBus: CommandBus
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(
				INTEGRATION_PERMISSION_SERVICE_TOKEN
			)
		}
		return this._integrationPermissionService
	}

	public async execute(command: LarkMessageCommand): Promise<unknown> {
		const { options } = command
		const { userId, integrationId, message, input } = options
		const integration = await this.integrationPermissionService.read(integrationId)
		if (!integration) {
			throw new Error(`Integration ${integrationId} not found`)
		}

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

		await this.larkService.errorMessage(
			{
				integrationId,
				chatId: options.chatId
			},
			new Error('No xpertId configured for this Lark integration. Please configure xpertId first.')
		)
		return null
	}
}
