import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AIProvidersService, AiProviderCredentialsValidateCommand } from '../../../ai-model'
import { CopilotProvider } from '../../copilot-provider.entity'
import { CopilotProviderService } from '../../copilot-provider.service'
import { CopilotProviderUpsertCommand } from '../upsert.command'

@CommandHandler(CopilotProviderUpsertCommand)
export class CopilotProviderUpsertHandler implements ICommandHandler<CopilotProviderUpsertCommand> {
	readonly #logger = new Logger(CopilotProviderUpsertHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly providersService: AIProvidersService,
		private readonly service: CopilotProviderService
	) {}

	public async execute(command: CopilotProviderUpsertCommand): Promise<CopilotProvider> {
		const entity = command.entity
		if (entity.providerName) {
			this.providersService.getProvider(entity.providerName, true)
		}

		// Check authorization
		if (entity.credentials) {
			entity.credentials = await this.commandBus.execute(
				new AiProviderCredentialsValidateCommand(entity.providerName, entity.credentials)
			)
		}

		if (entity.id) {
			await this.service.update(entity.id, entity)
			return this.service.findOne(entity.id)
		}

		return this.service.create(entity)
	}
}
