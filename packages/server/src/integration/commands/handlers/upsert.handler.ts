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
			const previous = await this.service.findOne(input.id)
			const patch = omit(input, 'id')
			const current = {
				...previous,
				...patch
			} as IIntegration
			await this.service.runStrategyUpdateHook(previous, current)
			await this.service.update(input.id, patch)
			return await this.service.findOne(input.id)
		} else {
			return await this.service.create(omit(input, 'id'))
		}
	}
}
