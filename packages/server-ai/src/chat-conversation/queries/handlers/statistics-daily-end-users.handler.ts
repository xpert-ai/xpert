import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsDailyEndUsersQuery } from '../statistics-daily-end-suers.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsDailyEndUsersQuery)
export class StatisticsDailyEndUsersHandler implements IQueryHandler<StatisticsDailyEndUsersQuery> {
	constructor(
		@InjectRepository(ChatConversation)
		public repository: Repository<ChatConversation>,
		private readonly queryBus: QueryBus) {}

	public async execute(command: StatisticsDailyEndUsersQuery) {
		const { xpertId, start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository

		const query = repository
			.createQueryBuilder('conversation')
			.select('DATE("createdAt") as date')
			.addSelect('COUNT(DISTINCT COALESCE("fromEndUserId", "createdById"::text)) as count')
			.where('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.from != :from', { from: 'debugger' })

		if (!xpertId) {
			query.andWhere('conversation.organizationId = :organizationId', {organizationId})
		}
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
