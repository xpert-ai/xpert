import { RequestContext } from '@metad/server-core'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { StatisticsTokenCostQuery } from '../statistics-token-cost.query'

@QueryHandler(StatisticsTokenCostQuery)
export class StatisticsTokenCostQueryHandler implements IQueryHandler<StatisticsTokenCostQuery> {
    private readonly logger = new Logger(StatisticsTokenCostQueryHandler.name)

    @InjectRepository(ChatConversation)
    public repository: Repository<ChatConversation>

	public async execute(command: StatisticsTokenCostQuery) {
		const { xpertId, start, end } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const repository = this.repository

		const params: Array<string> = [tenantId, 'debugger', 'ai', start || '0', end || '']
		let paramIndex = params.length + 1
		let organizationWhere = ''
		let xpertWhere = ''

		// For xpert-specific monitor, aggregate all usages by xpertId across organizations.
		if (!xpertId) {
			organizationWhere = `AND cc."organizationId" = $${paramIndex}`
			params.push(organizationId)
			paramIndex++
		}
		if (xpertId) {
			xpertWhere = `AND cc."xpertId" = $${paramIndex}`
			params.push(xpertId)
		}

        const query = `SELECT 
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
        ${organizationWhere}
        ${xpertWhere}
        AND cc."from" != $2
        AND cm."role" = $3
        AND cc."createdAt" >= $4::timestamptz
        AND cc."createdAt" <= $5::timestamptz
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
        ${organizationWhere}
        ${xpertWhere}
        AND cc."from" != $2
        AND cm."role" = $3
        AND cc."createdAt" >= $4::timestamptz
        AND cc."createdAt" <= $5::timestamptz
    GROUP BY 
        date, model, subexecution.currency
) AS combined_data
WHERE tokens > 0
GROUP BY 
    date, model, currency
ORDER BY 
    date ASC;`

        this.logger.verbose('Executing StatisticsTokenCostQuery with query:', query, 'and params:', params)
        return await repository.manager.query(query, params)
	}
}
