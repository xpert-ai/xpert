import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertProjectService } from '../../project.service'
import { ReadProjectFileCommand } from '../read-file.command'

@CommandHandler(ReadProjectFileCommand)
export class ReadProjectFileHandler implements ICommandHandler<ReadProjectFileCommand> {
	readonly #logger = new Logger(ReadProjectFileHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectService
	) {}

	public async execute(command: ReadProjectFileCommand) {
		return await this.service.getFileByPath(command.projectId, command.filePath)
	}
}
