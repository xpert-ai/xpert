import { getAgentMiddlewareNodes, IWFNMiddleware, TXpertGraph } from '@metad/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'

export const DEFAULT_MEMORY_PROVIDER_NAME = 'file-memory'

export type ActiveMemoryMiddleware = {
    middlewareProvider: string
    providerName: string
    nodeKey: string
}

export function resolveActiveMemoryMiddleware(
    graph: TXpertGraph | null | undefined,
    agentKey: string | null | undefined,
    registry: AgentMiddlewareRegistry
): ActiveMemoryMiddleware | null {
    if (!graph || !agentKey) {
        return null
    }

    const middlewareNodes = getAgentMiddlewareNodes(graph, agentKey)
    for (const node of middlewareNodes) {
        const entity = node?.entity as IWFNMiddleware | undefined
        const middlewareProvider = entity?.provider
        if (!middlewareProvider) {
            continue
        }

        try {
            const strategy = registry.get(middlewareProvider)
            if (strategy?.meta?.exclusiveCategory !== 'memory') {
                continue
            }

            return {
                middlewareProvider,
                providerName: normalizeMemoryProviderName(entity.options?.providerName),
                nodeKey: node.key
            }
        } catch {
            continue
        }
    }

    return null
}

export function normalizeMemoryProviderName(providerName: unknown): string {
    if (typeof providerName === 'string' && providerName.trim().length) {
        return providerName.trim()
    }

    return DEFAULT_MEMORY_PROVIDER_NAME
}
