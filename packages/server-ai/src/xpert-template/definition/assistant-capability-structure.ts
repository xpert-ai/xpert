import {
    getAgentMiddlewareNodes,
    isMiddlewareToolEnabled,
    normalizeMiddlewareProvider,
    TXpertGraph,
    IWFNMiddleware,
    AssistantCapabilitySummary,
    AssistantTemplateDefinition
} from '@xpert-ai/contracts'

/** Shared structural traversal. No middleware execution, project access or user preferences. */
export function collectAssistantMiddleware(graph: TXpertGraph, agentKey: string) {
    return getAgentMiddlewareNodes(graph, agentKey).flatMap((node) => {
        const entity = node.entity as IWFNMiddleware
        const provider = normalizeMiddlewareProvider(entity?.provider)
        return provider
            ? [
                  {
                      node,
                      entity,
                      provider,
                      toolNames: Object.entries(entity.tools ?? {})
                          .filter(([, value]) => isMiddlewareToolEnabled(value))
                          .map(([name]) => name)
                  }
              ]
            : []
    })
}

export function summarizeAssistantDefinition(definition: AssistantTemplateDefinition): AssistantCapabilitySummary {
    return {
        agents: definition.nodes
            .filter((node) => node.type === 'agent')
            .map((node) => ({
                key: node.key,
                label: typeof node.entity.title === 'string' ? node.entity.title : node.key,
                middleware: collectAssistantMiddleware(definition, node.key).map(({ provider, toolNames }) => ({
                    provider,
                    toolNames
                }))
            })),
        skills: (definition.template?.dependencies?.skills ?? []).map((skill) => ({
            ...skill,
            pluginName: skill.pluginName ?? ''
        })),
        seedMemoryCount: definition.memories?.length ?? 0,
        sandbox: definition.team.features?.sandbox?.enabled === true
    }
}
