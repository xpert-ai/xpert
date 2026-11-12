import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GroupAnalyticsBindingCommand } from '@xpert-ai/server-core'
import { GroupResourceAnalysisService } from '../../group-resource-analysis.service'
import { GroupAnalysisDefinitionCommand } from '../../../../analytics/commands/group-analysis-definition.command'

@CommandHandler(GroupAnalyticsBindingCommand)
export class GroupAnalyticsBindingHandler implements ICommandHandler<GroupAnalyticsBindingCommand> {
    constructor(
        private readonly analysis: GroupResourceAnalysisService,
        private readonly commands: CommandBus
    ) {}
    async execute({ actor, groupId, referenceId, datasetKey }: GroupAnalyticsBindingCommand) {
        const selected = await this.analysis.resolveAnalysisBinding(actor, groupId, referenceId, datasetKey)
        const source =
            selected.binding.source.kind === 'definition'
                ? await this.commands.execute(
                      new GroupAnalysisDefinitionCommand(actor, selected.binding.source, selected.approvedById)
                  )
                : undefined
        return {
            binding: selected.binding,
            source,
            revalidate: selected.revalidate,
            project: selected.project,
            normalizeControls: selected.normalizeControls
        }
    }
}
