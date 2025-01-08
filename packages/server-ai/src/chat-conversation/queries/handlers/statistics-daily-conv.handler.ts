import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsDailyConvQuery } from '../statistics-daily-conv.query'

@QueryHandler(StatisticsDailyConvQuery)
export class StatisticsDailyConvHandler implements IQueryHandler<StatisticsDailyConvQuery> {
	constructor(
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: StatisticsDailyConvQuery) {
		const { id, start, end } = command

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('chat_conversation')
			.select('DATE("createdAt") as date')
			.addSelect('COUNT(*) as count')
			.where('chat_conversation.createdAt BETWEEN :start AND :end', { start, end })
			.andWhere('chat_conversation.xpertId = :id', { id })
			.addGroupBy('date')

		return await query.getRawMany()
	}
}
