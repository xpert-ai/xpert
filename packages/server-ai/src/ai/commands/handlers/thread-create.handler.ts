import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import { ChatConversationUpsertCommand, GetChatConversationQuery } from '../../../chat-conversation'
import { ThreadAlreadyExistsException } from '../../../core'
import { ThreadDTO } from '../../dto'
import { ThreadCreateCommand } from '../thread-create.command'

@CommandHandler(ThreadCreateCommand)
export class ThreadCreateHandler implements ICommandHandler<ThreadCreateCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ThreadCreateCommand): Promise<ThreadDTO> {
		const input = command.input
		let conversation = null
		if (input.thread_id) {
			conversation = await this.queryBus.execute(
				new GetChatConversationQuery({
					threadId: input.thread_id
				})
			)

			if (input.if_exists === 'raise' && conversation) {
				throw new ThreadAlreadyExistsException()
			}

			if (!conversation) {
				conversation = await this.commandBus.execute(
					new ChatConversationUpsertCommand({
						threadId: input.thread_id,
						title: input.metadata?.title,
						from: 'api'
					})
				)
			}
		} else {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					threadId: uuidv4(),
					title: input.metadata?.title,
					from: 'api'
				})
			)
		}

		return new ThreadDTO(conversation)
	}
}
