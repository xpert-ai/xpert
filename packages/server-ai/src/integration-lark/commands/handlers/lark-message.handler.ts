import { RequestContext } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatLarkMessage } from '../../chat/message'
import { LarkChatAgentCommand } from '../chat-agent.command'
import { LarkChatXpertCommand } from '../chat-xpert.command'
import { LarkMessageCommand } from '../mesage.command'
import { LarkService } from '../../lark.service'

@CommandHandler(LarkMessageCommand)
export class LarkMessageHandler implements ICommandHandler<LarkMessageCommand> {
	constructor(
		private readonly larkService: LarkService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: LarkMessageCommand): Promise<unknown> {
		const { input } = command
		const { integration, message } = input

		if (integration.options?.xpertId) {
			const { content } = message.message
			const textContent = JSON.parse(content)
			const text = textContent.text as string

			const larkMessage = new ChatLarkMessage(
				{...input, larkService: this.larkService },
				{
					text
				},
			)

			return await this.commandBus.execute(
				new LarkChatXpertCommand(integration.options.xpertId, text, larkMessage)
			)
		}

		return await this.commandBus.execute(new LarkChatAgentCommand(input))
	}
}
