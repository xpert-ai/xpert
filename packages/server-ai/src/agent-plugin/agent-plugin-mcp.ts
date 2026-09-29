import { isEqual } from 'lodash'
import type { PortablePlugin } from './agent-plugin-parser'
import type { AgentPluginConnectorAuth, AgentPluginConnectorBinding } from '@xpert-ai/contracts'

export function connectorMcpAuth(binding?: AgentPluginConnectorBinding, requirement?: AgentPluginConnectorAuth) {
    if (!binding || !requirement) return undefined
    return {
        type: 'connector' as const,
        ...binding,
        ...(requirement.type === 'existing' ? { resource: requirement.resource } : {}),
        ...(requirement.scopes ? { scopes: requirement.scopes } : {})
    }
}

/** Translate only at the host boundary; the stored portable descriptor stays standard. */
export function portableMcpSchema(
    server: PortablePlugin['servers'][number],
    oauth: boolean,
    connector?: ReturnType<typeof connectorMcpAuth>
) {
    return {
        mcpServers: {
            [server.key]: {
                ...server.config,
                type: 'http',
                ...(connector ? { auth: connector } : oauth ? { auth: { type: 'oauth', binding: 'user' } } : {})
            }
        }
    }
}

export function matchesPortableMcpSchema(
    schema: string | null | undefined,
    server: PortablePlugin['servers'][number],
    oauth: boolean,
    connector?: ReturnType<typeof connectorMcpAuth>
) {
    try {
        return isEqual(JSON.parse(schema ?? ''), portableMcpSchema(server, oauth, connector))
    } catch {
        return false
    }
}
