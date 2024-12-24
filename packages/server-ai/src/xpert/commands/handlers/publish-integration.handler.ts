import { IntegrationUpsertCommand } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertPublishIntegrationCommand } from '../publish-integration.command'

@CommandHandler(XpertPublishIntegrationCommand)
export class XpertPublishIntegrationHandler implements ICommandHandler<XpertPublishIntegrationCommand> {
	readonly #logger = new Logger(XpertPublishIntegrationHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: XpertPublishIntegrationCommand): Promise<Xpert> {
		const { id, integration } = command

		const _integration = await this.commandBus.execute(new IntegrationUpsertCommand(integration))

		const xpert = await this.xpertService.findOne(id, { relations: ['integrations'] })

		xpert.integrations = xpert.integrations.filter((_) => _.id !== _integration.id)
		xpert.integrations.push(_integration)

		await this.xpertService.save(xpert)

		return _integration
	}
}
