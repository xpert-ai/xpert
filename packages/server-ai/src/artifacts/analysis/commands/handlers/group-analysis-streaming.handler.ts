import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { GroupAnalysisStreamingCommand } from '../group-analysis-streaming.command'
import { ResourceAnalysisExecution } from '../../resource-analysis-execution.entity'

@CommandHandler(GroupAnalysisStreamingCommand)
export class GroupAnalysisStreamingHandler implements ICommandHandler<GroupAnalysisStreamingCommand> {
    constructor(private readonly db: DataSource) {}
    execute({ tenantId, organizationId, groupId, executionId }: GroupAnalysisStreamingCommand) {
        if (!tenantId || !organizationId || !groupId || !executionId) return Promise.resolve(true)
        return this.db
            .getRepository(ResourceAnalysisExecution)
            .existsBy({ tenantId, organizationId, groupId, executionId })
    }
}
