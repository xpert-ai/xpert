import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { StatisticsDailyMessagesQuery } from '../statistics-daily-messages.query'

@QueryHandler(StatisticsDailyMessagesQuery)
export class StatisticsDailyMessagesHandler implements IQueryHandler<StatisticsDailyMessagesQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: StatisticsDailyMessagesQuery) {
		const { id, start, end } = command

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('chat_conversation')
			.innerJoinAndSelect('chat_conversation.messages', 'chat_message')
			.select('DATE(chat_conversation."createdAt") as date')
			.addSelect('COUNT(DISTINCT chat_message.id) as count')
			.where('chat_conversation.xpertId = :id', { id })
			.andWhere('chat_message.role = :role', { role: 'ai' })
		if (start) {
			query.andWhere('chat_conversation.createdAt >= :start', { start })
		}
		if (end) {
			query.andWhere('chat_conversation.createdAt <= :end', { end })
		}
		query.addGroupBy('date').orderBy('date')

		return await query.getRawMany()
	}
}
