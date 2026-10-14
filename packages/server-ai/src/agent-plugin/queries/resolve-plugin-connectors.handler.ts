import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { BadRequestException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'
import { AgentPluginPackage, AgentResourceBinding } from '../agent-plugin.entity'
import { visibleAgentPluginScopes } from '../agent-plugin-scope'
import { importedPluginBinding, installedPluginBindings } from '../installed-plugin-catalog'
import { agentPluginConnectorProviders } from '../agent-plugin-connector-providers'
import { ResolvePluginConnectorsQuery } from './resolve-plugin-connectors.query'

@QueryHandler(ResolvePluginConnectorsQuery)
export class ResolvePluginConnectorsHandler implements IQueryHandler<ResolvePluginConnectorsQuery> {
    private readonly logger = new Logger(ResolvePluginConnectorsHandler.name)

    constructor(
        @InjectRepository(AgentPluginPackage) private readonly packages: Repository<AgentPluginPackage>,
        @InjectRepository(AgentResourceBinding) private readonly bindings: Repository<AgentResourceBinding>
    ) {}

    async execute({ scope, workspaceId, provider }: ResolvePluginConnectorsQuery): Promise<ConnectorStrategyRuntime[]> {
        if (!scope.tenantId) return []
        const where = visibleAgentPluginScopes(scope)
        const [packages, bindings] = await Promise.all([this.packages.find({ where }), this.bindings.find({ where })])
        const providers = new Map<string, ConnectorStrategyRuntime>()
        // Existing accounts and OAuth sessions retain their exact provider even after
        // a package upgrade or disable. Only the discovery catalog selects active versions.
        const candidates = provider
            ? [...bindings, ...packages.map((pkg) => importedPluginBinding(pkg))]
            : installedPluginBindings(packages, bindings, scope, workspaceId)
        for (const binding of candidates) {
            if ((!provider && !binding.enabled) || binding.definition.kind !== 'agent_plugin') continue
            const packageId = binding.definition.packageId
            const pkg = packages.find((item) => item.id === packageId)
            if (!pkg) continue
            const requirements = binding.definition.connectorServers ?? pkg.descriptor.extension?.connectors ?? {}
            for (const [key, requirement] of Object.entries(requirements)) {
                try {
                    const strategy = agentPluginConnectorProviders(
                        pkg,
                        { [key]: requirement },
                        scope.organizationId
                    ).get(key)?.strategy
                    if (
                        strategy &&
                        (!provider || strategy.definition.provider === provider) &&
                        !providers.has(strategy.definition.provider)
                    )
                        providers.set(strategy.definition.provider, strategy)
                } catch (error) {
                    // Imports retain diagnostics for failed components; one unavailable
                    // component must not break every connector in the scope.
                    if (!(error instanceof BadRequestException)) throw error
                    this.logger.warn({ packageId: pkg.id, connector: key, message: error.message })
                }
            }
        }
        return [...providers.values()]
    }
}
