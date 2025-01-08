import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { StatisticsDailyMessagesQuery } from '../statistics-daily-messages.query'
import { ChatConversation } from '../../conversation.entity'

@QueryHandler(StatisticsDailyMessagesQuery)
export class StatisticsDailyMessagesHandler implements IQueryHandler<StatisticsDailyMessagesQuery> {
	constructor(
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: StatisticsDailyMessagesQuery) {
		const { id, start, end } = command

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('chat_conversation')
			.innerJoinAndSelect('chat_conversation.messages', 'chat_message')
			.select('DATE(chat_conversation."createdAt") as date')
			.addSelect('COUNT(DISTINCT chat_message.id) as count')
			.where('chat_conversation.createdAt BETWEEN :start AND :end', { start, end })
			.andWhere('chat_conversation.xpertId = :id', { id })
			.andWhere('chat_message.role = :role', { role: 'ai' })
			.addGroupBy('date')

		return await query.getRawMany()
	}
}
