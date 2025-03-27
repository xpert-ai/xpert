import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ModelQueryLogService } from '../../log.service'
import { ModelQueryLogUpsertCommand } from '../upsert.command'

@CommandHandler(ModelQueryLogUpsertCommand)
export class ModelQueryLogUpsertHandler implements ICommandHandler<ModelQueryLogUpsertCommand> {
	private logger = new Logger(ModelQueryLogUpsertHandler.name)

	constructor(private readonly service: ModelQueryLogService) {}

	public async execute(command: ModelQueryLogUpsertCommand) {
		const { entity } = command
		if (entity.id) {
			return await this.service.update(entity.id, entity)
		}
		return await this.service.create(entity)
	}
}
