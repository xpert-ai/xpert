import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsUserSatisfactionRateQuery } from '../statistics-user-satisfaction-rate.query'
import { RequestContext } from '@metad/server-core'

@QueryHandler(StatisticsUserSatisfactionRateQuery)
export class StatisticsUserSatisfactionRateHandler implements IQueryHandler<StatisticsUserSatisfactionRateQuery> {
	constructor(private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsUserSatisfactionRateQuery) {
		const { xpertId, start, end } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = getRepository(ChatConversation)
        const where = xpertId ? `AND cc."xpertId" = $7` : ''

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
        AND cc."organizationId" = $2
        AND cc."from" != $3 ${where}
        AND cm."role" = $4
        AND cc."createdAt" >= $5
        AND cc."createdAt" <= $6
    GROUP BY 
        date
) AS satisfaction
GROUP BY 
    date
ORDER BY 
    date ASC;`,
			[tenantId, organizationId, 'debugger', 'ai', start || '0', end || '', ...(xpertId ? [xpertId] : [])]
		)
	}
}
