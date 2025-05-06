import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertProjectFileService } from '../../services'
import { DeleteProjectFileCommand } from '../delete-file.command'

@CommandHandler(DeleteProjectFileCommand)
export class DeleteProjectFileHandler implements ICommandHandler<DeleteProjectFileCommand> {
	readonly #logger = new Logger(DeleteProjectFileHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectFileService
	) {}

	public async execute(command: DeleteProjectFileCommand) {
		const result = await this.service.findOneOrFail({
			where: { projectId: command.projectId, filePath: command.filePath }
		})
		if (result.success) {
			await this.service.delete(result.record)
		}
	}
}
