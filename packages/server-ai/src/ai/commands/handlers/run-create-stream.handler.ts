import { CommandBus, QueryBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RunCreateStreamCommand } from '../run-create-stream.command'
import { ChatConversationUpsertCommand, FindChatConversationQuery } from '../../../chat-conversation'
import { FindXpertQuery, XpertChatCommand } from '../../../xpert'

@CommandHandler(RunCreateStreamCommand)
export class RunCreateStreamHandler implements ICommandHandler<RunCreateStreamCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: RunCreateStreamCommand): Promise<any> {
		const threadId = command.threadId
		const input = command.input

		console.log(input)
		
		// Find thread (conversation) and assistant (xpert)
		const conversation = await this.queryBus.execute(new FindChatConversationQuery({ key: threadId }))
		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: input.assistant_id }))

		// Update xpert id for chat conversation
		conversation.xpertId = xpert.id
		await this.commandBus.execute(new ChatConversationUpsertCommand(conversation))

		return await this.commandBus.execute(new XpertChatCommand({
			input: input.input as any,
			xpertId: xpert.id,
			conversationId: conversation.id,
		}, {}))
	}
}
