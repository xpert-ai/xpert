import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { getRepository } from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { StatisticsTokensPerSecondQuery } from '../statistics-tokens-per-second.query'

@QueryHandler(StatisticsTokensPerSecondQuery)
export class StatisticsTokensPerSecondHandler
	implements IQueryHandler<StatisticsTokensPerSecondQuery>
{
	constructor(private readonly service: ChatConversationService) {}

	public async execute(command: StatisticsTokensPerSecondQuery) {
		const { id, start, end } = command

		const repository = getRepository(ChatConversation)

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
        cc."xpertId" = $1 
        AND cc."from" != $2 
        AND cm."role" = $3 
        AND cc."createdAt" >= $4 
        AND cc."createdAt" <= $5 
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
        cc."xpertId" = $1 
        AND cc."from" != $2 
        AND cm."role" = $3 
        AND cc."createdAt" >= $4 
        AND cc."createdAt" <= $5 
    GROUP BY 
        date
) AS combined_data
GROUP BY 
    date 
ORDER BY 
    date ASC;`, [id, 'debugger', 'ai', start || '0', end || ''])
	}
}
