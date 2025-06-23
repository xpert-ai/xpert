import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { XpertExportCommand } from '../../../xpert/commands'
import { XpertDraftDslDTO } from '../../../xpert/dto'
import { ProjectPackDslDTO, XpertProjectDslDTO } from '../../dto'
import { XpertProjectService } from '../../project.service'
import { ExportProjectCommand } from '../export.command'

@CommandHandler(ExportProjectCommand)
export class ExportProjectHandler implements ICommandHandler<ExportProjectCommand> {
	readonly #logger = new Logger(ExportProjectHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectService
	) {}

	public async execute(command: ExportProjectCommand) {
		const { projectId } = command

		const project = await this.service.findOne(projectId, { relations: [
			'copilotModel',
			'xperts', 
			'toolsets',
			'toolsets.tools',
			'knowledges',
			]
		})
		const xperts = await Promise.all(
			project.xperts.map((xpert) =>
				this.commandBus.execute<XpertExportCommand, XpertDraftDslDTO>(new XpertExportCommand(xpert.id, false))
			)
		)
		return instanceToPlain(
			new ProjectPackDslDTO({
				project: new XpertProjectDslDTO({ ...project, xperts })
			})
		)
	}
}
