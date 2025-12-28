import { IChatConversation } from '@metad/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { FindOptionsWhere } from 'typeorm'
import { FindChatConversationQuery } from '../../../chat-conversation'
import { ThreadDTO } from '../../dto'
import { SearchThreadsQuery } from '../thread-search.query'

@QueryHandler(SearchThreadsQuery)
export class SearchThreadsHandler implements IQueryHandler<SearchThreadsQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: SearchThreadsQuery): Promise<ThreadDTO> {
		const request = command.request

		const conditions = {} as FindOptionsWhere<IChatConversation>
		if (request.metadata?.assistant_id) {
			conditions.xpertId = request.metadata.assistant_id
		}
		const { items } = await this.queryBus.execute(new FindChatConversationQuery(conditions))

		return items.map((_) => new ThreadDTO(_))
	}
}
