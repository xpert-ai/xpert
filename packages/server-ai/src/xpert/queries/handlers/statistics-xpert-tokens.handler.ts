import { RequestContext } from '@xpert-ai/server-core'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Xpert } from '../../xpert.entity'
import { StatisticsXpertTokensQuery } from '../statistics-xpert-tokens.query'
import {
	normalizeStatisticsFilters,
	statisticsConversationUserSql,
	statisticsModelSql
} from '../../../chat-conversation/queries'

@QueryHandler(StatisticsXpertTokensQuery)
export class StatisticsXpertTokensHandler implements IQueryHandler<StatisticsXpertTokensQuery> {
	constructor(
        @InjectRepository(Xpert)
        private readonly repository: Repository<Xpert>,
	) {}

	public async execute(command: StatisticsXpertTokensQuery) {
		const { start, end, filters } = command
        const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const normalizedFilters = normalizeStatisticsFilters(filters)
		const params: Array<string> = [tenantId, organizationId, 'debugger', 'ai', start || '0', end || '']
		let paramIndex = params.length + 1
		let userWhere = ''
		let executionModelWhere = ''
		let subexecutionModelWhere = ''

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

		return await this.repository.manager.query(`SELECT 
    slug, 
    SUM(tokens) AS tokens,
    SUM(latency) AS latency,
	CAST(ROUND(SUM(tokens) / COALESCE(SUM(latency), 1) * 100) AS numeric) / 100 AS count
FROM (
    SELECT 
        xpert.slug AS slug,
        SUM(execution."tokens") AS tokens, 
        SUM(execution."responseLatency") AS latency
    FROM 
        "chat_conversation" AS cc
    INNER JOIN 
        "chat_message" AS cm 
        ON cm."conversationId" = cc."id"
	LEFT OUTER JOIN
        "xpert" AS xpert
        ON xpert.id = cc."xpertId"
    INNER JOIN 
        "xpert_agent_execution" AS execution 
        ON execution."id" = cm."executionId" 
    WHERE 
        cc."tenantId" = $1
        AND cc."organizationId" = $2
        ${userWhere}
        ${executionModelWhere}
        AND cc."from" != $3
        AND cm."role" = $4
        AND cc."createdAt" >= $5
        AND cc."createdAt" <= $6
        AND execution."responseLatency" > 0
    GROUP BY 
        slug

    UNION ALL

    SELECT 
        xpert.slug AS slug, 
        SUM(subexecution."tokens") AS tokens, 
        SUM(subexecution."responseLatency") AS latency 
    FROM 
        "chat_conversation" AS cc
    INNER JOIN 
        "chat_message" AS cm 
        ON cm."conversationId" = cc."id"
	LEFT OUTER JOIN
        "xpert" AS xpert
        ON xpert.id = cc."xpertId"
    INNER JOIN 
        "xpert_agent_execution" AS execution 
        ON execution."id" = cm."executionId"  
    INNER JOIN 
        "xpert_agent_execution" AS subexecution 
        ON subexecution."parentId" = execution."id" 
    WHERE 
         cc."tenantId" = $1
        AND cc."organizationId" = $2
        ${userWhere}
        ${subexecutionModelWhere}
        AND cc."from" != $3
        AND cm."role" = $4
        AND cc."createdAt" >= $5
        AND cc."createdAt" <= $6 
        AND subexecution."responseLatency" > 0
    GROUP BY 
        slug
) AS combined_data
GROUP BY 
    slug 
ORDER BY 
    tokens DESC;`, params)
	}
}
