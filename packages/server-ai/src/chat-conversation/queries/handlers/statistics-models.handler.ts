import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { normalizeStatisticsFilters, statisticsConversationUserSql, statisticsModelSql } from '../statistics-filters'
import { StatisticsModelsQuery } from '../statistics-models.query'

@QueryHandler(StatisticsModelsQuery)
export class StatisticsModelsHandler implements IQueryHandler<StatisticsModelsQuery> {
    @InjectRepository(ChatConversation)
    public repository: Repository<ChatConversation>

    public async execute(command: StatisticsModelsQuery) {
        const { start, end, filters } = command
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const normalizedFilters = normalizeStatisticsFilters(filters)

        const params: Array<string> = [tenantId, 'debugger', 'ai', start || '0', end || '']
        let paramIndex = params.length + 1
        let organizationWhere = ''
        let userWhere = ''

        if (organizationId) {
            organizationWhere = `AND cc."organizationId" = $${paramIndex}`
            params.push(organizationId)
            paramIndex++
        } else {
            organizationWhere = 'AND cc."organizationId" IS NULL'
        }

        if (normalizedFilters.userId) {
            userWhere = `AND ${statisticsConversationUserSql('cc')} = $${paramIndex}`
            params.push(normalizedFilters.userId)
        }

        return await this.repository.manager.query(
            `SELECT
	model,
	SUM(tokens) AS tokens
FROM (
	SELECT
		${statisticsModelSql('execution')} AS model,
		SUM(execution."tokens") AS tokens
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
		${userWhere}
		AND cc."from" != $2
		AND cm."role" = $3
		AND cc."createdAt" >= $4::timestamptz
		AND cc."createdAt" <= $5::timestamptz
	GROUP BY
		model

	UNION ALL

	SELECT
		${statisticsModelSql('subexecution')} AS model,
		SUM(subexecution."tokens") AS tokens
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
		${userWhere}
		AND cc."from" != $2
		AND cm."role" = $3
		AND cc."createdAt" >= $4::timestamptz
		AND cc."createdAt" <= $5::timestamptz
	GROUP BY
		model
) AS used_models
WHERE tokens > 0 AND model != 'unknown/unknown'
GROUP BY
	model
ORDER BY
	tokens DESC;`,
            params
        )
    }
}
