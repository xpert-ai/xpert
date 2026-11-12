import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Logger } from '@nestjs/common'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { StatisticsTokenCostQuery } from '../statistics-token-cost.query'
import { normalizeStatisticsFilters, statisticsConversationUserSql, statisticsModelSql } from '../statistics-filters'

import { postedPointsByExecutionSql } from '../../../membership/posted-model-points'

@QueryHandler(StatisticsTokenCostQuery)
export class StatisticsTokenCostQueryHandler implements IQueryHandler<StatisticsTokenCostQuery> {
    private readonly logger = new Logger(StatisticsTokenCostQueryHandler.name)

    @InjectRepository(ChatConversation)
    public repository: Repository<ChatConversation>

    public async execute(command: StatisticsTokenCostQuery) {
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

        // For xpert-specific monitor, aggregate all usages by xpertId across organizations.
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
            executionModelWhere = `WHERE ${statisticsModelSql('execution')} = ${modelParam}`
            params.push(normalizedFilters.model)
        }

        const query = `
WITH RECURSIVE roots AS (
    SELECT DISTINCT DATE(cc."createdAt") AS date, cm."executionId" AS id
    FROM chat_conversation cc JOIN chat_message cm ON cm."conversationId" = cc.id
    WHERE cc."tenantId" = $1 AND cc."from" != $2 AND cm.role = $3
      AND cc."createdAt" BETWEEN $4::timestamptz AND $5::timestamptz
      ${organizationWhere} ${xpertWhere} ${userWhere}
), runs AS (
    SELECT date, id FROM roots
    UNION
    SELECT runs.date, child.id FROM runs JOIN xpert_agent_execution child ON child."parentId" = runs.id AND child."tenantId" = $1
), debits AS (
    ${postedPointsByExecutionSql('runs')}
), usage AS (
    SELECT runs.date, ${statisticsModelSql('execution')} AS model,
           execution.tokens, debits.points
    FROM runs JOIN xpert_agent_execution execution ON execution.id = runs.id AND execution."tenantId" = $1
    LEFT JOIN debits ON debits.id = execution.id
    ${executionModelWhere}
)
SELECT date, model, SUM(tokens) AS tokens, SUM(points) AS "chargedPoints"
FROM usage WHERE tokens > 0 OR points IS NOT NULL
GROUP BY date, model
ORDER BY date ASC`

        this.logger.verbose('Executing StatisticsTokenCostQuery with query:', query, 'and params:', params)
        const rows: { date: string; model: string; tokens: string; chargedPoints: string | null }[] =
            await repository.manager.query(query, params)
        return rows.map((row) => ({
            ...row,
            tokens: Number(row.tokens),
            chargedPoints: row.chargedPoints == null ? null : Number(row.chargedPoints)
        }))
    }
}
