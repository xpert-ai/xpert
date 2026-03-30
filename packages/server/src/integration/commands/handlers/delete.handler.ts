import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IntegrationService } from '../../integration.service'
import { IntegrationDelCommand } from '../delete.command'

@CommandHandler(IntegrationDelCommand)
export class IntegrationDelHandler implements ICommandHandler<IntegrationDelCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: IntegrationService
	) {}

	public async execute(command: IntegrationDelCommand): Promise<void> {
		const { id } = command
		const previous = await this.service.findOne(id)
		await this.service.runStrategyDeleteHook(previous)
		await this.service.delete(id)
	}
}
