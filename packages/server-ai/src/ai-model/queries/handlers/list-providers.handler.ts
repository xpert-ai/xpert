import { IAiProviderEntity } from '@xpert-ai/contracts'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AIModelProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ListModelProvidersQuery } from '../list-providers.query'

@QueryHandler(ListModelProvidersQuery)
export class ListModelProvidersHandler implements IQueryHandler<ListModelProvidersQuery> {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly registry: AIModelProviderRegistry
    ) {}

    public async execute(command: ListModelProvidersQuery) {
        const names = command.names
        const providers = this.registry.list()

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
                const notImplementedOrder = Number(Boolean(a.not_implemented)) - Number(Boolean(b.not_implemented))
                return notImplementedOrder || a.provider.localeCompare(b.provider)
            })
    }
}
