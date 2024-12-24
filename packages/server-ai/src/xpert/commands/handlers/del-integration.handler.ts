import { IntegrationDelCommand } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertService } from '../../xpert.service'
import { XpertDelIntegrationCommand } from '../del-integration.command'

@CommandHandler(XpertDelIntegrationCommand)
export class XpertDelIntegrationHandler implements ICommandHandler<XpertDelIntegrationCommand> {
	readonly #logger = new Logger(XpertDelIntegrationHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: XpertDelIntegrationCommand): Promise<void> {
		const { id, integration } = command
		const xpert = await this.xpertService.findOne(id, { relations: ['integrations'] })

		await this.commandBus.execute(new IntegrationDelCommand(integration))

		xpert.integrations = xpert.integrations.filter((_) => _.id !== integration)
		await this.xpertService.save(xpert)
	}
}
