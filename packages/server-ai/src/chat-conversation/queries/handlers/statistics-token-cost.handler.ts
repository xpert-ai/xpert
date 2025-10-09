import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { getRepository, Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsTokenCostQuery } from '../statistics-token-cost.query'
import { RequestContext } from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'

@QueryHandler(StatisticsTokenCostQuery)
export class StatisticsTokenCostQueryHandler implements IQueryHandler<StatisticsTokenCostQuery>
{
	constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsTokenCostQuery) {
		const { xpertId, start, end } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository
        
        const where = xpertId ? `AND cc."xpertId" = $7` : ''

        return await repository.manager.query(`SELECT 
    date,
    model,
    COALESCE(currency, '') AS currency,
    SUM(tokens) AS tokens,
    SUM(price) AS price
FROM (
    SELECT 
        DATE(cc."createdAt") AS date,
        COALESCE(execution.metadata->>'provider', 'unknown') || '/' || COALESCE(execution.metadata->>'model', 'unknown') AS model,
        execution.currency AS currency,
        SUM(execution."tokens") AS tokens,
        SUM(execution."totalPrice") AS price
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
    GROUP BY 
        date, model, execution.currency

    UNION ALL

    SELECT 
        DATE(cc."createdAt") AS date,
        COALESCE(subexecution.metadata->>'provider', 'unknown') || '/' || COALESCE(subexecution.metadata->>'model', 'unknown') AS model,
        subexecution.currency AS currency,
        SUM(subexecution."tokens") AS tokens,
        SUM(subexecution."totalPrice") AS price
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
    GROUP BY 
        date, model, subexecution.currency
) AS combined_data
WHERE tokens > 0
GROUP BY 
    date, model, currency
ORDER BY 
    date ASC;`, [tenantId, organizationId, 'debugger', 'ai', start || '0', end || '', ...(xpertId ? [xpertId] : [])])

	}
}
