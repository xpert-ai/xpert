import { CONVERSATION_MAP_FEATURE, type IXpert, type TXpertTeamNode } from '@xpert-ai/contracts'
import type { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { inspectAssistantMiddlewares } from '../middleware-access/assistant-middleware'

/** Shared by published runtime consumers and the Agent View host; connected middleware owns its features. */
export function agentCapabilities(xpert: IXpert, registry: Pick<AgentMiddlewareRegistry, 'get'>) {
    const graph = xpert.graph
    const middlewareGraph = inspectAssistantMiddlewares(xpert, registry)
    const agentKey = middlewareGraph.agent?.key ?? null
    const features = new Set<string>([
        CONVERSATION_MAP_FEATURE,
        ...Object.entries(xpert.features ?? {})
            .filter(([, value]) => Boolean(value && typeof value === 'object' && 'enabled' in value && value.enabled))
            .map(([key]) => key)
    ])
    const middlewareProviders = new Set<string>(),
        middlewareNodeKeys = new Set<string>()
    for (const middleware of middlewareGraph.middlewares) {
        middlewareProviders.add(middleware.provider)
        if (middleware.key) middlewareNodeKeys.add(middleware.key)
        for (const feature of middleware.features) features.add(feature)
    }
    const availableAgents = (graph?.nodes ?? [])
        .filter((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
        .map((node) => ({
            key: node.entity?.key ?? node.key,
            title: node.entity?.title ?? node.entity?.name ?? node.entity?.key ?? node.key,
            role: node.entity?.description ?? node.entity?.title ?? node.entity?.name ?? node.entity?.key ?? node.key
        }))
        .filter((agent) => Boolean(agent.key))
        .sort((a, b) => a.key.localeCompare(b.key))
    return {
        agentKey,
        features: [...features].sort(),
        availableAgents,
        middlewareProviders: [...middlewareProviders].sort(),
        middlewareNodeKeys: [...middlewareNodeKeys].sort()
    }
}
