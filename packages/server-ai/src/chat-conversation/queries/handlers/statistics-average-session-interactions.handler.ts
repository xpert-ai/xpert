import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsAverageSessionInteractionsQuery } from '../statistics-average-session-interactions.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsAverageSessionInteractionsQuery)
export class StatisticsAverageSessionInteractionsHandler
	implements IQueryHandler<StatisticsAverageSessionInteractionsQuery>
{
	constructor(
		@InjectRepository(ChatConversation)
		public repository: Repository<ChatConversation>,
		private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsAverageSessionInteractionsQuery) {
		const { xpertId, start, end } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository

		const query = repository
			.createQueryBuilder('conversation')
			.innerJoinAndSelect('conversation.messages', 'chat_message')
			.select('DATE(conversation."createdAt") as date')
			.addSelect('COUNT(*)', 'messages_count')
			.addSelect('COUNT( DISTINCT conversation.id)', 'conversations_count')
			.addSelect('COUNT(*) / COUNT( DISTINCT conversation.id)', 'count')
			.where('conversation.tenantId = :tenantId', {tenantId})
			.andWhere('conversation.organizationId = :organizationId', {organizationId})
			.andWhere('conversation.from != :from', { from: 'debugger' })
			.andWhere('chat_message.role = :role', { role: 'human' })

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
