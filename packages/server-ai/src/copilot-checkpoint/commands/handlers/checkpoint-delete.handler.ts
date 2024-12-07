import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CheckpointDeleteCommand } from '../checkpoint-delete.command'
import { CopilotCheckpointService } from '../../copilot-checkpoint.service'

@CommandHandler(CheckpointDeleteCommand)
export class CheckpointDeleteHandler implements ICommandHandler<CheckpointDeleteCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: CopilotCheckpointService
	) {}

	public async execute(command: CheckpointDeleteCommand): Promise<void> {
		const conditions = command.conditions

		await this.service.delete(conditions)
	}
}
