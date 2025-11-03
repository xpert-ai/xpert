import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AIModelProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AIProvidersService } from '../../ai-model.service'
import { ListModelProvidersQuery } from '../list-providers.query'

@QueryHandler(ListModelProvidersQuery)
export class ListModelProvidersHandler implements IQueryHandler<ListModelProvidersQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: AIProvidersService,
		private readonly registry: AIModelProviderRegistry
	) {}

	public async execute(command: ListModelProvidersQuery) {
		const names = command.names
		const positionMap = this.service.getPositionMap()
		const providers = this.registry.list()
		providers.push(...this.service.getAllProviders())

		return providers
			.map((p) => p.getProviderSchema())
			.filter((provider) => (names ? names.includes(provider.provider) : true))
			.sort(
			(a, b) =>
				positionMap[a.provider] +
				(a.not_implemented ? 999 : 0) -
				(positionMap[b.provider] + (b.not_implemented ? 999 : 0))
		)
	}
}
