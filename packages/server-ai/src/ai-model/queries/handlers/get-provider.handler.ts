import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AIProvidersService } from '../../ai-model.service'
import { AIModelGetProviderQuery } from '../get-provider.query'

@QueryHandler(AIModelGetProviderQuery)
export class AIModelGetProviderHandler implements IQueryHandler<AIModelGetProviderQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: AIProvidersService
	) {}

	public async execute(command: AIModelGetProviderQuery) {
		const providerName = command.name
		return this.service.getProvider(providerName, false, command.organizationId)
	}
}
