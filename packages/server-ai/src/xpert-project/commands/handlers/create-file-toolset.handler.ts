import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertProjectService } from '../../project.service'
import { XpertProjectTaskService } from '../../services/'
import { CreateFileToolsetCommand } from '../create-file-toolset.command'
import { ProjectFileToolset } from '../../tools'

@CommandHandler(CreateFileToolsetCommand)
export class CreateFileToolsetHandler implements ICommandHandler<CreateFileToolsetCommand> {
	readonly #logger = new Logger(CreateFileToolsetHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectService,
		private readonly taskService: XpertProjectTaskService
	) {}

	public async execute(command: CreateFileToolsetCommand) {
		const project = await this.service.findOne(command.projectId)
		return new ProjectFileToolset({
			tenantId: RequestContext.currentTenantId(),
			organizationId: RequestContext.getOrganizationId(),
			env: {},

			commandBus: this.commandBus,
			queryBus: this.queryBus,
			// project
			project,
			projectService: this.service,
			taskService: this.taskService
		})
	}
}
