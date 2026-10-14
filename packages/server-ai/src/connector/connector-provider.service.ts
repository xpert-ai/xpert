import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ConnectorStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolvePluginConnectorsQuery } from '../agent-plugin/queries/resolve-plugin-connectors.query'
import { McpOAuthConnectorStrategy } from './mcp-oauth.strategy'
import { adaptMcpConnector } from './mcp-native-connector-adapter'

@Injectable()
export class ConnectorProviderService {
    constructor(
        private readonly registry: ConnectorStrategyRegistry,
        private readonly queries: QueryBus
    ) {}

    async listRuntime(organizationId?: string, tenantId = RequestContext.currentTenantId(), workspaceId?: string) {
        const dynamic = await this.queries.execute(
            new ResolvePluginConnectorsQuery({ tenantId, organizationId: organizationId ?? null }, workspaceId)
        )
        // Legacy installation may register adapters before persisting its binding. The
        // catalog always uses current persisted configuration, never those process-local entries.
        const registered = this.registry
            .listRuntime(organizationId)
            .filter((item) => !(item instanceof McpOAuthConnectorStrategy))
        return [
            ...new Map(
                [...dynamic.map((item) => adaptMcpConnector(item, registered)), ...registered].map((item) => [
                    item.definition.provider,
                    item
                ])
            ).values()
        ]
    }

    async findRuntime(provider: string, organizationId?: string, tenantId = RequestContext.currentTenantId()) {
        const available = this.registry.listRuntime(organizationId)
        const registered = available.find((item) => item.definition.provider === provider)
        if (registered && !(registered instanceof McpOAuthConnectorStrategy)) return registered
        const dynamic = await this.queries.execute(
            new ResolvePluginConnectorsQuery({ tenantId, organizationId: organizationId ?? null }, undefined, provider)
        )
        return dynamic[0] && adaptMcpConnector(dynamic[0], available)
    }

    async getRuntime(provider: string, organizationId?: string, tenantId = RequestContext.currentTenantId()) {
        const strategy = await this.findRuntime(provider, organizationId, tenantId)
        if (!strategy) throw new NotFoundException()
        if (strategy.definition.unavailable) throw new BadRequestException(strategy.definition.unavailable)
        return strategy
    }
}
