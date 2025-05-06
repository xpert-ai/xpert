import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertProjectService } from '../../project.service'
import { XpertProjectTaskService } from '../../services/project-task.service'
import { CreateProjectToolsetCommand } from '../create-toolset.command'
import { ProjectToolset } from '../../tools'

@CommandHandler(CreateProjectToolsetCommand)
export class CreateProjectToolsetHandler implements ICommandHandler<CreateProjectToolsetCommand> {
	readonly #logger = new Logger(CreateProjectToolsetHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectService,
		private readonly taskService: XpertProjectTaskService
	) {}

	public async execute(command: CreateProjectToolsetCommand) {
		const project = await this.service.findOne(command.projectId)
		return new ProjectToolset(project, this.service, this.taskService, {
			tenantId: RequestContext.currentTenantId(),
			organizationId: RequestContext.getOrganizationId(),
			commandBus: this.commandBus,
			queryBus: this.queryBus,
			env: {}
		})
	}
}
