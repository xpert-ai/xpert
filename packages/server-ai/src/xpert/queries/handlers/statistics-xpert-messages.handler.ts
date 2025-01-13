import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../../core/entities/internal'
import { StatisticsXpertMessagesQuery } from '../statistics-xpert-messages.query'
import { RequestContext } from '@metad/server-core'

@QueryHandler(StatisticsXpertMessagesQuery)
export class StatisticsXpertMessagesHandler implements IQueryHandler<StatisticsXpertMessagesQuery> {
	constructor(
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: StatisticsXpertMessagesQuery) {
		const { start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = getRepository(ChatConversation)

		const query = repository
			.createQueryBuilder('conversation')
			.innerJoin('conversation.messages', 'message')
			.innerJoin('conversation.xpert', 'xpert')
			.select('xpert.slug as slug')
			.addSelect('COUNT(DISTINCT message.id) as count')
			.where('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.organizationId = :organizationId', {organizationId})
			.andWhere('conversation.from != :from', { from: 'debugger' })
			.andWhere('message.role = :role', {role: 'ai'})

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
