import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsAverageSessionInteractionsQuery } from '../statistics-average-session-interactions.query'

@QueryHandler(StatisticsAverageSessionInteractionsQuery)
export class StatisticsAverageSessionInteractionsHandler
	implements IQueryHandler<StatisticsAverageSessionInteractionsQuery>
{
	constructor(private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsAverageSessionInteractionsQuery) {
		const { id, start, end } = command

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('chat_conversation')
			.innerJoinAndSelect('chat_conversation.messages', 'chat_message')
			.select('DATE(chat_conversation."createdAt") as date')
			.addSelect('COUNT(*)', 'messages_count')
			.addSelect('COUNT( DISTINCT chat_conversation.id)', 'conversations_count')
			.addSelect('COUNT(*) / COUNT( DISTINCT chat_conversation.id)', 'count')
			.where('chat_conversation.xpertId = :id', { id })
			.andWhere('chat_message.role = :role', { role: 'human' })

			if (start) {
				query.andWhere('chat_conversation.createdAt >= :start', { start })
			}
			if (end) {
				query.andWhere('chat_conversation.createdAt <= :end', { end })
			}
			query.addGroupBy('date')

		return await query.getRawMany()
	}
}
