import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsTokensPerSecondQuery } from '../statistics-tokens-per-second.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsTokensPerSecondQuery)
export class StatisticsTokensPerSecondHandler
	implements IQueryHandler<StatisticsTokensPerSecondQuery>
{
	constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsTokensPerSecondQuery) {
		const { xpertId, start, end } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository

        const where = xpertId ? `AND cc."xpertId" = $7` : ''

		return await repository.manager.query(`SELECT 
    date, 
    SUM(tokens) AS tokens,
    SUM(latency) AS latency,
	CAST(ROUND(SUM(tokens) / COALESCE(SUM(latency), 1) * 100) AS numeric) / 100 AS count
FROM (
    SELECT 
        DATE(cc."createdAt") AS date, 
        SUM(execution."tokens") AS tokens, 
        SUM(execution."responseLatency") AS latency
    FROM 
        "chat_conversation" AS cc
    INNER JOIN 
        "chat_message" AS cm 
        ON cm."conversationId" = cc."id"  
    INNER JOIN 
        "xpert_agent_execution" AS execution 
        ON execution."id" = cm."executionId" 
    WHERE 
        cc."tenantId" = $1
        AND cc."organizationId" = $2
        AND cc."from" != $3 ${where}
        AND cm."role" = $4
        AND cc."createdAt" >= $5
        AND cc."createdAt" <= $6
        AND execution."responseLatency" > 0
    GROUP BY 
        date

    UNION ALL

    SELECT 
        DATE(cc."createdAt") AS date, 
        SUM(subexecution."tokens") AS tokens, 
        SUM(subexecution."responseLatency") AS latency 
    FROM 
        "chat_conversation" AS cc
    INNER JOIN 
        "chat_message" AS cm 
        ON cm."conversationId" = cc."id"  
    INNER JOIN 
        "xpert_agent_execution" AS execution 
        ON execution."id" = cm."executionId"  
    INNER JOIN 
        "xpert_agent_execution" AS subexecution 
        ON subexecution."parentId" = execution."id" 
    WHERE 
        cc."tenantId" = $1
        AND cc."organizationId" = $2
        AND cc."from" != $3 ${where}
        AND cm."role" = $4
        AND cc."createdAt" >= $5
        AND cc."createdAt" <= $6
        AND subexecution."responseLatency" > 0
    GROUP BY 
        date
) AS combined_data
GROUP BY 
    date 
ORDER BY 
    date ASC;`, [tenantId, organizationId, 'debugger', 'ai', start || '0', end || '', ...(xpertId ? [xpertId] : [])])
	}
}
