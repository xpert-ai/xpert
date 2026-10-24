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
import { readInstalledPluginDetails, readInstalledPluginInventory } from '../installed-plugin-inventory'

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
        const [packages, bindings] = await Promise.all([
            readInstalledPluginInventory(this.packages, scope),
            this.bindings.find({ where })
        ])
        const providers = new Map<string, ConnectorStrategyRuntime>()
        // Existing accounts and OAuth sessions retain their exact provider even after
        // a package upgrade or disable. Only the discovery catalog selects active versions.
        const candidates = provider
            ? [...bindings, ...packages.map((pkg) => importedPluginBinding(pkg))]
            : installedPluginBindings(packages, bindings, scope, workspaceId)
        const byId = new Map(packages.map((pkg) => [pkg.id, pkg]))
        const eligible = candidates.flatMap((binding) => {
            if ((!provider && !binding.enabled) || binding.definition.kind !== 'agent_plugin') return []
            const pkg = byId.get(binding.definition.packageId)
            const requirements = binding.definition.connectorServers ?? pkg?.descriptor.extension?.connectors ?? {}
            return pkg && Object.keys(requirements).length ? [{ binding, pkg, requirements }] : []
        })
        const details = new Map(
            (
                await readInstalledPluginDetails(
                    this.packages,
                    scope,
                    eligible.map(({ pkg }) => pkg.id)
                )
            ).map((pkg) => [pkg.id, pkg])
        )
        for (const { pkg: inventory, requirements } of eligible) {
            const pkg = details.get(inventory.id)
            if (!pkg) continue
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
