import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsTokensPerSecondQuery } from '../statistics-tokens-per-second.query'
import { RequestContext } from '@xpert-ai/server-core'
import { InjectRepository } from '@nestjs/typeorm'
import { normalizeStatisticsFilters, statisticsConversationUserSql, statisticsModelSql } from '../statistics-filters'

@QueryHandler(StatisticsTokensPerSecondQuery)
export class StatisticsTokensPerSecondHandler
	implements IQueryHandler<StatisticsTokensPerSecondQuery>
{
	constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsTokensPerSecondQuery) {
		const { xpertId, start, end, filters } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const normalizedFilters = normalizeStatisticsFilters(filters)

		const repository = this.repository

		const params: Array<string> = [tenantId, 'debugger', 'ai', start || '0', end || '']
		let paramIndex = params.length + 1
		let organizationWhere = ''
		let xpertWhere = ''
		let userWhere = ''
		let executionModelWhere = ''
		let subexecutionModelWhere = ''

		if (!xpertId) {
			organizationWhere = `AND cc."organizationId" = $${paramIndex}`
			params.push(organizationId)
			paramIndex++
		}
		if (xpertId) {
			xpertWhere = `AND cc."xpertId" = $${paramIndex}`
			params.push(xpertId)
			paramIndex++
		}
		if (normalizedFilters.userId) {
			userWhere = `AND ${statisticsConversationUserSql('cc')} = $${paramIndex}`
			params.push(normalizedFilters.userId)
			paramIndex++
		}
		if (normalizedFilters.model) {
			const modelParam = `$${paramIndex}`
			executionModelWhere = `AND ${statisticsModelSql('execution')} = ${modelParam}`
			subexecutionModelWhere = `AND ${statisticsModelSql('subexecution')} = ${modelParam}`
			params.push(normalizedFilters.model)
		}

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
        ${organizationWhere}
        ${xpertWhere}
        ${userWhere}
        ${executionModelWhere}
        AND cc."from" != $2
        AND cm."role" = $3
        AND cc."createdAt" >= $4
        AND cc."createdAt" <= $5
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
        ${organizationWhere}
        ${xpertWhere}
        ${userWhere}
        ${subexecutionModelWhere}
        AND cc."from" != $2
        AND cm."role" = $3
        AND cc."createdAt" >= $4
        AND cc."createdAt" <= $5
        AND subexecution."responseLatency" > 0
    GROUP BY 
        date
) AS combined_data
GROUP BY 
    date 
ORDER BY 
    date ASC;`, params)
	}
}
