import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertProjectFileService } from '../../services'
import { UpsertProjectFileCommand } from '../upsert-file.command'

@CommandHandler(UpsertProjectFileCommand)
export class UpsertProjectFileHandler implements ICommandHandler<UpsertProjectFileCommand> {
	readonly #logger = new Logger(UpsertProjectFileHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly service: XpertProjectFileService
	) {}

	public async execute(command: UpsertProjectFileCommand) {
		const result = await this.service.findOneOrFail({
			where: { projectId: command.projectId, filePath: command.file.filePath }
		})
		if (result.success) {
			await this.service.update(result.record.id, { ...command.file })
		} else {
			await this.service.create({ ...command.file, projectId: command.projectId })
		}
	}
}
