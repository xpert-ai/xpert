import { LarkChatAgentCommand } from '@metad/server-ai'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatBICommand } from '../../../chatbi/index'

@CommandHandler(LarkChatAgentCommand)
export class LarkChatAgentHandler implements ICommandHandler<LarkChatAgentCommand> {
	constructor(private readonly commandBus: CommandBus) {}

	public async execute(command: LarkChatAgentCommand): Promise<unknown> {
		const { input } = command
		const chatId = input.message.message.chat_id
		const textContent = JSON.parse(input.message.message.content)
		let text = textContent.text as string
		// Remove mention user
		if (text && input.message.message.mentions) {
			input.message.message.mentions?.forEach((mention) => {
				text = text.split(mention.key).join('')
			})
		}

		
		return await this.commandBus.execute(
			new ChatBICommand({
				...input,
				userId: input.message.sender.sender_id.open_id,
				chatId,
				text
			})
		)
	}
}
