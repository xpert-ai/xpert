import { IIntegration } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IntegrationService } from '../../integration.service'
import { IntegrationUpsertCommand } from '../upsert.command'

@CommandHandler(IntegrationUpsertCommand)
export class IntegrationUpsertHandler implements ICommandHandler<IntegrationUpsertCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: IntegrationService
	) {}

	public async execute(command: IntegrationUpsertCommand): Promise<IIntegration> {
		const { input } = command
		if (input.id) {
			await this.service.update(input.id, omit(input, 'id'))
			return await this.service.findOne(input.id)
		} else {
			return await this.service.create(omit(input, 'id'))
		}
	}
}
