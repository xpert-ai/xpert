import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GroupAnalysisDefinitionCommand } from '../group-analysis-definition.command'
import { AnalyticsDefinitionService } from '../../analytics-definition.service'

@CommandHandler(GroupAnalysisDefinitionCommand)
export class GroupAnalysisDefinitionHandler implements ICommandHandler<GroupAnalysisDefinitionCommand> {
    constructor(private readonly definitions: AnalyticsDefinitionService) {}
    execute({ actor, source, approvedById }: GroupAnalysisDefinitionCommand) {
        return this.definitions.resolveForGroupAnalysis(actor, source, approvedById)
    }
}
