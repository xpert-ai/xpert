import { IIntegration } from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
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
			const next = await this.service.applyStrategyValidation({
				...previous,
				...patch
			} as IIntegration)
			await this.service.runStrategyUpdateHook(previous, next)
			await this.service.update(input.id, omit(next, 'id'))
			return await this.service.findOne(input.id)
		} else {
			const next = await this.service.applyStrategyValidation(omit(input, 'id'))
			return await this.service.create(next)
		}
	}
}
