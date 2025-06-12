import { TFile } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { XpertProjectFileDto } from '../../dto'
import { XpertProjectService } from '../../project.service'
import { ListProjectFilesCommand } from '../list-files.command'

@CommandHandler(ListProjectFilesCommand)
export class ListProjectFilesHandler implements ICommandHandler<ListProjectFilesCommand> {
	readonly #logger = new Logger(ListProjectFilesHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly projectService: XpertProjectService
	) {}

	public async execute(command: ListProjectFilesCommand) {
		const items = await this.projectService.getFiles(command.projectId)
		return instanceToPlain(items.map((_) => new XpertProjectFileDto(_))) as TFile[]
	}
}
