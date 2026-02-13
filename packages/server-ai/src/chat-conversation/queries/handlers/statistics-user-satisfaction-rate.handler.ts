import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsUserSatisfactionRateQuery } from '../statistics-user-satisfaction-rate.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsUserSatisfactionRateQuery)
export class StatisticsUserSatisfactionRateHandler implements IQueryHandler<StatisticsUserSatisfactionRateQuery> {
	constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsUserSatisfactionRateQuery) {
		const { xpertId, start, end } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository

		const params: Array<string> = [tenantId, 'debugger', 'ai', start || '0', end || '']
		let paramIndex = params.length + 1
		let organizationWhere = ''
		let xpertWhere = ''

		if (!xpertId) {
			organizationWhere = `AND cc."organizationId" = $${paramIndex}`
			params.push(organizationId)
			paramIndex++
		}
		if (xpertId) {
			xpertWhere = `AND cc."xpertId" = $${paramIndex}`
			params.push(xpertId)
		}

		return await repository.manager.query(
			`SELECT
    date,
    SUM(likes - dislike) / SUM(messages) * 1000 AS count
FROM (
    SELECT 
        DATE(cc."createdAt") AS date,
        COUNT(DISTINCT cm."id") AS messages,
        COUNT(CASE WHEN feedback.rating = 'like' THEN feedback."id" END) AS likes,
        COUNT(CASE WHEN feedback.rating = 'dislike' THEN feedback."id" END) AS dislike
    FROM 
        "chat_conversation" AS cc
    INNER JOIN 
        "chat_message" AS cm 
        ON cm."conversationId" = cc."id"
    LEFT JOIN 
        "chat_message_feedback" AS feedback
        ON cm."id" = feedback."messageId"
    WHERE 
        cc."tenantId" = $1
        ${organizationWhere}
        ${xpertWhere}
        AND cc."from" != $2
        AND cm."role" = $3
        AND cc."createdAt" >= $4
        AND cc."createdAt" <= $5
    GROUP BY 
        date
) AS satisfaction
GROUP BY 
    date
ORDER BY 
    date ASC;`,
			params
		)
	}
}
