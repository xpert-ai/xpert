import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsXpertConversationsQuery } from '../statistics-xpert-conv.query'
import { RequestContext } from '@metad/server-core'

@QueryHandler(StatisticsXpertConversationsQuery)
export class StatisticsXpertConversationsHandler implements IQueryHandler<StatisticsXpertConversationsQuery> {
	constructor(
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: StatisticsXpertConversationsQuery) {
		const { start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('conversation')
			.innerJoin('conversation.xpert', 'xpert')
			.select('xpert.slug as slug')
			.addSelect('COUNT(*) as count')
			.where('conversation.from != :from', { from: 'debugger' })
			.andWhere('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.organizationId = :organizationId', {organizationId})

		if (start) {
			query.andWhere('conversation.createdAt >= :start', { start })
		}
		if (end) {
			query.andWhere('conversation.createdAt <= :end', { end })
		}
		query.addGroupBy('slug').orderBy('count', 'DESC')

		return await query.getRawMany()
	}
}
