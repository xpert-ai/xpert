import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { XpertAgentExecution } from '../../agent-execution.entity'
import { AgentExecutionRunStatus, GetAgentExecutionRunStatusQuery } from '../get-run-status.query'

@QueryHandler(GetAgentExecutionRunStatusQuery)
export class GetAgentExecutionRunStatusHandler implements IQueryHandler<GetAgentExecutionRunStatusQuery> {
    constructor(@InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>) {}

    async execute(query: GetAgentExecutionRunStatusQuery): Promise<AgentExecutionRunStatus> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) throw new NotFoundException()
        const fields = [
            'id',
            'threadId',
            'xpertId',
            'status',
            'error',
            'elapsedTime',
            'createdAt',
            'updatedAt',
            'completedAt'
        ] as const
        const execution = await this.executions
            .createQueryBuilder('execution')
            .select(fields.map((field) => `execution."${field}" AS "${field}"`))
            .addSelect(`execution.metadata -> 'businessOutcome'`, 'businessOutcome')
            .where({ id: query.id, tenantId, organizationId: RequestContext.getOrganizationId() ?? IsNull() })
            .getRawOne<AgentExecutionRunStatus>()
        if (!execution) throw new NotFoundException()
        // PostgreSQL numeric values are strings when read without entity transformers.
        if (execution.elapsedTime != null) execution.elapsedTime = Number(execution.elapsedTime)
        return execution
    }
}
