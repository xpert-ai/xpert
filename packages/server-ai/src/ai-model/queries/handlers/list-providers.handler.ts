import { IAiProviderEntity } from '@metad/contracts'
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

		// Prefer plugin providers when provider names conflict with built-in ones.
		const uniqueProviders = new Map<string, IAiProviderEntity>()
		for (const provider of providers) {
			const schema = provider.getProviderSchema()
			if (!uniqueProviders.has(schema.provider)) {
				uniqueProviders.set(schema.provider, schema)
			}
		}

		return Array.from(uniqueProviders.values())
			.filter((provider) => (names ? names.includes(provider.provider) : true))
			.sort((a, b) => {
				const ap = positionMap[a.provider] ?? Number.MAX_SAFE_INTEGER
				const bp = positionMap[b.provider] ?? Number.MAX_SAFE_INTEGER
				return ap + (a.not_implemented ? 999 : 0) - (bp + (b.not_implemented ? 999 : 0))
			})
	}
}
