import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { GetChatConversationQuery } from '../../../chat-conversation'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { ThreadDTO } from '../../dto'
import { FindThreadQuery } from '../thread-find.query'

@QueryHandler(FindThreadQuery)
export class FindThreadHandler implements IQueryHandler<FindThreadQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: FindThreadQuery): Promise<ThreadDTO> {
		const chatConversation = await this.queryBus.execute(
			new GetChatConversationQuery({ threadId: command.threadId }, command.relations)
		)

		const tuple = await this.queryBus.execute(
			new CopilotCheckpointGetTupleQuery({
				thread_id: command.threadId,
				checkpoint_ns: ''
			})
		)

		return new ThreadDTO(chatConversation, tuple.checkpoint.channel_values)
	}
}
