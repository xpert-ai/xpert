import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsDailyEndUsersQuery } from '../statistics-daily-end-suers.query'

@QueryHandler(StatisticsDailyEndUsersQuery)
export class StatisticsDailyEndUsersHandler implements IQueryHandler<StatisticsDailyEndUsersQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: StatisticsDailyEndUsersQuery) {
		const { id, start, end } = command

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('chat_conversation')
			.select('DATE("createdAt") as date')
			.addSelect('COUNT(DISTINCT COALESCE("fromEndUserId", "createdById"::text)) as count')
			.where('chat_conversation.xpertId = :id', { id })
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
