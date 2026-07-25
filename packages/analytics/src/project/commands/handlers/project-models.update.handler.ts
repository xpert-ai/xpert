import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ProjectService } from '../../project.service'
import { ProjectModelsUpdateCommand } from '../project-models.update.command'

@CommandHandler(ProjectModelsUpdateCommand)
export class ProjectModelsUpdateHandler implements ICommandHandler<ProjectModelsUpdateCommand> {
	constructor(private readonly projectService: ProjectService) {}

	execute(command: ProjectModelsUpdateCommand) {
		return this.projectService.updateModels(command.projectId, command.modelIds)
	}
}
