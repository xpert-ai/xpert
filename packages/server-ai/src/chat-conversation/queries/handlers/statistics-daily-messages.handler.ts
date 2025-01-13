import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { StatisticsDailyMessagesQuery } from '../statistics-daily-messages.query'
import { RequestContext } from '@metad/server-core'

@QueryHandler(StatisticsDailyMessagesQuery)
export class StatisticsDailyMessagesHandler implements IQueryHandler<StatisticsDailyMessagesQuery> {
	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: StatisticsDailyMessagesQuery) {
		const { xpertId, start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('conversation')
			.innerJoinAndSelect('conversation.messages', 'chat_message')
			.select('DATE(conversation."createdAt") as date')
			.addSelect('COUNT(DISTINCT chat_message.id) as count')
			.where('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.organizationId = :organizationId', {organizationId})
			.andWhere('conversation.from != :from', { from: 'debugger' })
			.andWhere('chat_message.role = :role', { role: 'ai' })

		if (xpertId) {
			query.andWhere('conversation.xpertId = :xpertId', { xpertId })
		}
		if (start) {
			query.andWhere('conversation.createdAt >= :start', { start })
		}
		if (end) {
			query.andWhere('conversation.createdAt <= :end', { end })
		}
		query.addGroupBy('date').orderBy('date')

		return await query.getRawMany()
	}
}
