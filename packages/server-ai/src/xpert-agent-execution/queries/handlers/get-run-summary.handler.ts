import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { GetAgentExecutionRunSummaryQuery, TAgentExecutionRunSummary } from '../get-run-summary.query'

@QueryHandler(GetAgentExecutionRunSummaryQuery)
export class GetAgentExecutionRunSummaryHandler implements IQueryHandler<GetAgentExecutionRunSummaryQuery> {
    constructor(private readonly service: XpertAgentExecutionService) {}

    async execute(query: GetAgentExecutionRunSummaryQuery): Promise<TAgentExecutionRunSummary> {
        return this.service.findOne({
            where: { id: query.id },
            select: {
                id: true,
                threadId: true,
                parentId: true,
                xpertId: true,
                type: true,
                category: true,
                agentKey: true,
                title: true,
                status: true,
                error: true,
                elapsedTime: true,
                inputs: true,
                metadata: true,
                createdAt: true,
                updatedAt: true,
                xpert: { id: true, avatar: true }
            },
            relations: { xpert: true },
            // The avatar fallback must not eagerly hydrate the Assistant's tags.
            loadEagerRelations: false
        })
    }
}
