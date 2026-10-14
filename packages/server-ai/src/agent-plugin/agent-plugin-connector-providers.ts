import { BadRequestException } from '@nestjs/common'
import type { AgentPluginConnectorAuth } from '@xpert-ai/contracts'
import { t } from 'i18next'
import type { AgentPluginPackage } from './agent-plugin.entity'
import { McpOAuthConnectorStrategy } from '../connector/mcp-oauth.strategy'
import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'

/** Project portable requirements without registering strategies or creating connections. */
export function agentPluginConnectorProviders(
    pkg: AgentPluginPackage,
    requirements: { [server: string]: AgentPluginConnectorAuth },
    organizationId: string | null | undefined
) {
    const providers = new Map<string, { provider: string; strategy?: ConnectorStrategyRuntime }>()
    for (const [key, requirement] of Object.entries(requirements)) {
        const server = pkg.descriptor.servers.find((item) => item.key === key)
        if (!server || Object.keys(server.config.headers ?? {}).some((name) => name.toLowerCase() === 'authorization'))
            throw new BadRequestException(
                t('server-ai:Error.AgentPluginConnectorConfiguration', {
                    defaultValue: 'The plugin Connector configuration is missing or incompatible.'
                })
            )
        if (requirement.type === 'existing') {
            providers.set(key, {
                provider: requirement.provider,
                strategy: {
                    definition: {
                        provider: requirement.provider,
                        label: pkg.descriptor.extension?.interface?.displayName ?? requirement.provider,
                        runtimeUsage: 'credential',
                        authMethods: [],
                        unavailable: t('server-ai:Error.ConnectorProviderDependencyMissing', {
                            provider: requirement.provider,
                            defaultValue: `Install and enable connector provider ${requirement.provider} in this scope before connecting.`
                        })
                    }
                }
            })
            continue
        }
        const icon = pkg.descriptor.extension?.interface?.icon
        const strategy = new McpOAuthConnectorStrategy({
            tenantId: pkg.tenantId,
            organizationId: organizationId ?? null,
            serverUrl: server.config.url,
            title: `${pkg.descriptor.extension?.interface?.displayName ?? pkg.descriptor.name} (${key})`,
            icon: icon ? { type: 'image', value: icon } : undefined,
            scopes: requirement.scopes,
            clientRegistration: requirement.clientRegistration
        })
        providers.set(key, { provider: strategy.definition.provider, strategy })
    }
    return providers
}
