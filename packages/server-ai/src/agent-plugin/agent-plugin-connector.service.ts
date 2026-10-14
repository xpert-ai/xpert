import { resolveI18nText } from '@xpert-ai/contracts'
// Published bindings authorize installation; runtime credentials still require the
// current actor, exact Connector grant, workspace/project and resource checks.
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    OnApplicationBootstrap,
    OnModuleDestroy
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConnectorStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import type { AgentPluginConnectorAuth, AgentPluginConnectorBinding } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { ConnectorService } from '../connector/connector.service'
import { isEqual } from 'lodash'
import {
    McpOAuthConnectorStrategy,
    mcpConnectorProvider,
    type McpOAuthConnectorConfig
} from '../connector/mcp-oauth.strategy'
import { connectorMcpProvider } from '../connector/connector-mcp-provider'
import {
    configureMcpConnectorAuthProviderResolver,
    type McpConsumerAuthProviderRequest
} from '../mcp-consumer/auth/mcp-consumer-auth.registry'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { connectorMcpAuth, matchesPortableMcpSchema } from './agent-plugin-mcp'
import { agentPluginScope, agentPluginScopeWhere, visibleAgentPluginScopes } from './agent-plugin-scope'
import { installedPluginBindings } from './installed-plugin-catalog'

@Injectable()
export class AgentPluginConnectorService implements OnApplicationBootstrap, OnModuleDestroy {
    constructor(
        @InjectRepository(AgentPluginPackage) private readonly packages: Repository<AgentPluginPackage>,
        @InjectRepository(AgentResourceBinding) private readonly bindings: Repository<AgentResourceBinding>,
        private readonly connectors: ConnectorService,
        private readonly registry: ConnectorStrategyRegistry
    ) {}

    async onApplicationBootstrap() {
        // Include older/disabled versions: their accounts must remain disconnectable.
        for (const binding of await this.bindings.find()) {
            if (binding.definition.kind !== 'agent_plugin' || !binding.definition.connectorServers) continue
            const pkg = await this.packages.findOneBy({
                id: binding.definition.packageId,
                tenantId: binding.tenantId,
                organizationId: agentPluginScopeWhere({
                    tenantId: binding.tenantId,
                    organizationId: binding.organizationId ?? null
                }).organizationId
            })
            if (pkg?.organizationId) this.register(pkg, binding.definition.connectorServers)
        }
        configureMcpConnectorAuthProviderResolver((request) => this.provider(request))
    }

    onModuleDestroy() {
        configureMcpConnectorAuthProviderResolver(null)
    }

    register(
        pkg: AgentPluginPackage,
        requirements: { [server: string]: AgentPluginConnectorAuth },
        organizationId = pkg.organizationId
    ) {
        const providers = new Map<string, string>()
        for (const [key, requirement] of Object.entries(requirements)) {
            const server = pkg.descriptor.servers.find((item) => item.key === key)
            if (
                !server ||
                Object.keys(server.config.headers ?? {}).some((name) => name.toLowerCase() === 'authorization')
            )
                throw invalidConfiguration()
            if (requirement.type === 'existing') {
                providers.set(key, requirement.provider)
                continue
            }
            // Tenant packages register their OAuth provider in the consuming organization on demand.
            if (!organizationId) continue
            const icon = pkg.descriptor.extension?.interface?.icon
            const config: McpOAuthConnectorConfig = {
                tenantId: pkg.tenantId,
                organizationId,
                serverUrl: server.config.url,
                title: `${resolveI18nText(pkg.descriptor.extension?.interface?.displayName) ?? pkg.descriptor.name} (${key})`,
                icon: icon ? { type: 'image', value: icon } : undefined,
                scopes: requirement.scopes,
                clientRegistration: requirement.clientRegistration
            }
            const provider = mcpConnectorProvider(config)
            const existing = this.registry
                .listRuntime(organizationId)
                .find((item) => item.definition.provider === provider)
            if (!existing) {
                this.registry.register(provider, new McpOAuthConnectorStrategy(config), {
                    kind: 'builtin',
                    scopeKey: organizationId
                })
            } else if (!existing.definition.icon && config.icon) {
                existing.definition.icon = config.icon
            }
            providers.set(key, provider)
        }
        return providers
    }

    async install(
        pkg: AgentPluginPackage,
        workspaceId: string,
        requirements: { [server: string]: AgentPluginConnectorAuth }
    ) {
        const providers = this.register(pkg, requirements)
        const available = await this.connectors.listBindings({ type: 'workspace', workspaceId })
        const result: { [server: string]: AgentPluginConnectorBinding } = {}
        for (const [key, provider] of providers) {
            let binding = available.find((item) => item.provider === provider)
            if (!binding) {
                if (requirements[key].type === 'existing') throw invalidConfiguration()
                binding = await this.connectors.createBinding({
                    provider,
                    authorizationMode: 'shared',
                    scope: { type: 'workspace', workspaceId }
                })
                available.push(binding)
            }
            if (binding.authorizationMode !== 'shared') throw invalidConfiguration()
            result[key] = { bindingId: binding.id, provider }
        }
        return result
    }

    async status(reference: AgentPluginConnectorBinding, assistantId: string) {
        const status = await this.connectors.authorizationStatusBinding(reference.bindingId, assistantId)
        if (status.connector.provider !== reference.provider) throw invalidConfiguration()
        return status.granted ? ('ready' as const) : ('requires_auth' as const)
    }

    /** Reuse existing shared connections through Assistant run access; never create or authorize one here. */
    async runtimeBindings(
        pkg: AgentPluginPackage,
        assistantId: string,
        requirements: { [server: string]: AgentPluginConnectorAuth },
        previous: { [server: string]: AgentPluginConnectorBinding } = {}
    ) {
        const providers = this.register(pkg, requirements, RequestContext.getOrganizationId())
        if (!providers.size) return {}
        const options = await this.connectors.runtimeOptions(assistantId)
        const result: { [server: string]: AgentPluginConnectorBinding } = {}
        for (const [key, provider] of providers) {
            const existing = previous[key]
            const option = options.items.find(
                (item) =>
                    item.provider === provider &&
                    item.authorizationMode === 'shared' &&
                    (!existing || item.bindingId === existing.bindingId)
            )
            if (option) result[key] = { bindingId: option.bindingId, provider }
        }
        return result
    }

    async authorization(reference: AgentPluginConnectorBinding, assistantId: string) {
        const status = await this.connectors.authorizationStatusBinding(reference.bindingId, assistantId)
        if (status.connector.provider !== reference.provider) throw invalidConfiguration()
        const options = await this.connectors.runtimeOptions(assistantId)
        const option = options.items.find((item) => item.bindingId === reference.bindingId)
        if (!option) throw invalidConfiguration()
        return {
            type: 'connector' as const,
            status: status.granted ? 'connected' : 'requires_auth',
            connector: {
                bindingId: reference.bindingId,
                provider: reference.provider,
                scope: status.connector.scope,
                authMethods: option.authMethods,
                authorizationMode: option.authorizationMode,
                canManage: option.canManage,
                managementUrl: option.managementUrl
            }
        }
    }

    private async provider(request: McpConsumerAuthProviderRequest) {
        const config = request.server.auth
        if (config?.type !== 'connector' || !request.server.url || !request.toolset.id) throw invalidConfiguration()
        const resolve = async () => {
            const scope = request.runtimeScope
            if (
                !scope?.xpertId ||
                !scope.conversationId ||
                !scope.executionId ||
                scope.tenantId !== RequestContext.currentTenantId() ||
                scope.userId !== RequestContext.currentUserId() ||
                scope.organizationId !== RequestContext.getOrganizationId()
            )
                throw denied()
            const where = {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId()
            }
            const toolset = await this.packages.manager
                .getRepository(XpertToolset)
                .findOneBy({ ...where, id: request.toolset.id })
            if (!toolset || toolset.workspaceId !== request.toolset.workspaceId) throw denied()
            const candidates = await this.bindings.find({ where: visibleAgentPluginScopes(agentPluginScope()) })
            const owner = candidates.find(
                (binding) =>
                    binding.enabled &&
                    binding.installations[toolset.workspaceId]?.toolsets.includes(toolset.id) &&
                    binding.installations[toolset.workspaceId]?.connectors?.[request.serverName]?.bindingId ===
                        config.bindingId
            )
            if (!owner || owner.definition.kind !== 'agent_plugin') throw denied()
            const pkg = await this.packages.findOneByOrFail({
                ...agentPluginScopeWhere({ tenantId: where.tenantId, organizationId: owner.organizationId ?? null }),
                id: owner.definition.packageId
            })
            const packages = await this.packages.find({ where: visibleAgentPluginScopes(agentPluginScope()) })
            const effective = installedPluginBindings(packages, candidates, agentPluginScope(), toolset.workspaceId)
            if (
                !effective.some((item) => {
                    const definition = item.definition
                    return (
                        item.enabled &&
                        definition.kind === 'agent_plugin' &&
                        packages.some(
                            (candidate) =>
                                candidate.id === definition.packageId &&
                                candidate.descriptor.name === pkg.descriptor.name
                        )
                    )
                })
            )
                throw denied()
            const server = pkg.descriptor.servers.find((item) => item.key === request.serverName)
            const expected = connectorMcpAuth(
                owner.installations[toolset.workspaceId].connectors?.[request.serverName],
                owner.definition.connectorServers?.[request.serverName]
            )
            if (
                !server ||
                !expected ||
                !isEqual(expected, config) ||
                server.config.url !== request.server.url ||
                !matchesPortableMcpSchema(toolset.schema, server, false, expected)
            )
                throw denied()
            return this.connectors.getRuntimeConnectorCredentialForScope(
                { bindingId: config.bindingId, provider: config.provider },
                {
                    ...scope,
                    connectorBindingIds: [config.bindingId],
                    allowWorkspaceBindingsInProject: true
                }
            )
        }
        const provider = connectorMcpProvider(resolve, {
            serverUrl: request.server.url,
            provider: config.provider,
            resource: config.resource,
            scopes: config.scopes
        })
        await provider.tokens()
        return provider
    }
}

function invalidConfiguration() {
    return new BadRequestException(
        t('server-ai:Error.AgentPluginConnectorConfiguration', {
            defaultValue: 'The plugin Connector configuration is missing or incompatible.'
        })
    )
}
function denied() {
    return new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
}
