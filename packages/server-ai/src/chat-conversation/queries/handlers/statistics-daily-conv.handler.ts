import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsDailyConvQuery } from '../statistics-daily-conv.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsDailyConvQuery)
export class StatisticsDailyConvHandler implements IQueryHandler<StatisticsDailyConvQuery> {
	constructor(
		@InjectRepository(ChatConversation)
		public repository: Repository<ChatConversation>,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: StatisticsDailyConvQuery) {
		const { xpertId, start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository

		const query = repository
			.createQueryBuilder('conversation')
			.select('DATE("createdAt") as date')
			.addSelect('COUNT(*) as count')
			.where('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.organizationId = :organizationId', {organizationId})
			.andWhere('conversation.from != :from', { from: 'debugger' })

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
