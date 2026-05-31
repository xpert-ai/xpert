export type StatisticsQueryFilters = {
    model?: string | null
    userId?: string | null
}

type FilterQueryBuilder = {
    andWhere(condition: string, parameters?: Record<string, string>): unknown
}

type MessageFilterQueryBuilder = FilterQueryBuilder & {
    innerJoin(table: string, alias: string, condition: string): unknown
    leftJoin(table: string, alias: string, condition: string): unknown
}

function normalizeFilterValue(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed || undefined
}

export function normalizeStatisticsFilters(filters?: StatisticsQueryFilters) {
    const model = normalizeFilterValue(filters?.model)
    const userId = normalizeFilterValue(filters?.userId)

    return {
        ...(model ? { model } : {}),
        ...(userId ? { userId } : {})
    }
}

export function statisticsModelSql(alias: string) {
    return `COALESCE(${alias}.metadata->>'provider', 'unknown') || '/' || COALESCE(${alias}.metadata->>'model', 'unknown')`
}

export function statisticsConversationUserSql(alias: string) {
    return `COALESCE(${alias}."fromEndUserId", ${alias}."createdById"::text)`
}

export function statisticsConversationModelExistsSql(conversationAlias: string) {
    return `EXISTS (
	SELECT 1
	FROM "chat_message" AS model_message
	INNER JOIN "xpert_agent_execution" AS model_execution
		ON model_execution."id" = model_message."executionId"
	LEFT JOIN "xpert_agent_execution" AS model_subexecution
		ON model_subexecution."parentId" = model_execution."id"
	WHERE model_message."conversationId" = ${conversationAlias}.id
		AND model_message."role" = 'ai'
		AND (
			${statisticsModelSql('model_execution')} = :filterModel
			OR ${statisticsModelSql('model_subexecution')} = :filterModel
		)
)`
}

export function applyStatisticsFilters(
    query: FilterQueryBuilder,
    conversationAlias: string,
    filters?: StatisticsQueryFilters
) {
    const normalized = normalizeStatisticsFilters(filters)

    if (normalized.userId) {
        query.andWhere(`${statisticsConversationUserSql(conversationAlias)} = :filterUserId`, {
            filterUserId: normalized.userId
        })
    }

    if (normalized.model) {
        query.andWhere(statisticsConversationModelExistsSql(conversationAlias), {
            filterModel: normalized.model
        })
    }
}

export function applyStatisticsMessageFilters(
    query: MessageFilterQueryBuilder,
    conversationAlias: string,
    messageAlias: string,
    filters?: StatisticsQueryFilters
) {
    const normalized = normalizeStatisticsFilters(filters)

    if (normalized.userId) {
        query.andWhere(`${statisticsConversationUserSql(conversationAlias)} = :filterUserId`, {
            filterUserId: normalized.userId
        })
    }

    if (normalized.model) {
        query.innerJoin(
            'xpert_agent_execution',
            'message_execution',
            `message_execution.id = ${messageAlias}."executionId"`
        )
        query.leftJoin(
            'xpert_agent_execution',
            'message_subexecution',
            'message_subexecution."parentId" = message_execution.id'
        )
        query.andWhere(
            `(${statisticsModelSql('message_execution')} = :filterModel OR ${statisticsModelSql('message_subexecution')} = :filterModel)`,
            { filterModel: normalized.model }
        )
    }
}
