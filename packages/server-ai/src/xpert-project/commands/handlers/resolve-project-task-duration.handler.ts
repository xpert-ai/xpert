import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ProjectConfigurationService } from '../../configuration/project-configuration.service'
import { ResolveProjectTaskDurationCommand } from '../resolve-project-task-duration.command'

@CommandHandler(ResolveProjectTaskDurationCommand)
export class ResolveProjectTaskDurationHandler implements ICommandHandler<ResolveProjectTaskDurationCommand> {
    constructor(private readonly configurations: ProjectConfigurationService) {}
    execute(command: ResolveProjectTaskDurationCommand) {
        return this.configurations.taskDuration(command.projectId, command.actor)
    }
}
