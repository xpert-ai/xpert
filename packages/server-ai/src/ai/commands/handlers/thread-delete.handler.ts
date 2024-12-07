import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { ThreadDeleteCommand } from '../thread-delete.command'
import { CheckpointDeleteCommand } from '../../../copilot-checkpoint/'
import { ChatConversationDeleteCommand } from '../../../chat-conversation'
import { XpertAgentExecutionDelCommand } from '../../../xpert-agent-execution/'

@CommandHandler(ThreadDeleteCommand)
export class ThreadDeleteHandler implements ICommandHandler<ThreadDeleteCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ThreadDeleteCommand): Promise<void> {
		const threadId = command.id

		// Delete agent executions of xpert by thread id
		await this.commandBus.execute(new XpertAgentExecutionDelCommand({ threadId }))

		// Delete checkpoint of langgraph by thread id
		await this.commandBus.execute(new CheckpointDeleteCommand({ thread_id: threadId }))

		// Delete chat conversation by thread id
		await this.commandBus.execute(new ChatConversationDeleteCommand({ threadId }))
	}
}
