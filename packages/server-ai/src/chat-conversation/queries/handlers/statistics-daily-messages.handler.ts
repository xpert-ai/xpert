import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { StatisticsDailyMessagesQuery } from '../statistics-daily-messages.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsDailyMessagesQuery)
export class StatisticsDailyMessagesHandler implements IQueryHandler<StatisticsDailyMessagesQuery> {
	constructor(
		@InjectRepository(ChatConversation)
		public repository: Repository<ChatConversation>,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: StatisticsDailyMessagesQuery) {
		const { xpertId, start, end, currentUserOnly } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()

		const repository = this.repository

		const query = repository
			.createQueryBuilder('conversation')
			.innerJoinAndSelect('conversation.messages', 'chat_message')
			.select('DATE(chat_message."createdAt") as date')
			.addSelect('COUNT(chat_message.id) as count')
			.where('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.from != :from', { from: 'debugger' })
			.andWhere('chat_message.role IN (:...roles)', { roles: ['human', 'ai'] })

		if (!xpertId) {
			if (organizationId) {
				query.andWhere('conversation.organizationId = :organizationId', { organizationId })
			} else {
				query.andWhere('conversation.organizationId IS NULL')
			}
		}
		if (xpertId) {
			query.andWhere('conversation.xpertId = :xpertId', { xpertId })
		}
		if (currentUserOnly && userId) {
			query.andWhere('conversation.createdById = :userId', { userId })
		}
		if (start) {
			query.andWhere('chat_message.createdAt >= :start', { start })
		}
		if (end) {
			query.andWhere('chat_message.createdAt <= :end', { end })
		}
		query.addGroupBy('date').orderBy('date')

		return await query.getRawMany()
	}
}
