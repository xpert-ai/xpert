import { CommandBus, QueryBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatConversationUpsertCommand, FindChatConversationQuery } from '../../../chat-conversation'
import { ThreadDTO } from '../../dto'
import { ThreadCreateCommand } from '../thread-create.command'
import { ThreadAlreadyExistsException } from '../../../core'
import { v4 as uuidv4 } from 'uuid';

@CommandHandler(ThreadCreateCommand)
export class ThreadCreateHandler implements ICommandHandler<ThreadCreateCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: ThreadCreateCommand): Promise<any> {
		const input = command.input
		let conversation = null
		if (input.thread_id) {
			conversation = await this.queryBus.execute(
				new FindChatConversationQuery({
					key: input.thread_id,
				})
			)
			
			if (input.if_exists === 'raise' && conversation) {
				throw new ThreadAlreadyExistsException()
			}

			if (!conversation) {
				conversation = await this.commandBus.execute(
					new ChatConversationUpsertCommand({
						key: input.thread_id,
						title: input.metadata?.title
					})
				)
			}
		} else {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					key: uuidv4(),
					title: input.metadata?.title
				})
			)
		}

		return new ThreadDTO(conversation)
	}
}
