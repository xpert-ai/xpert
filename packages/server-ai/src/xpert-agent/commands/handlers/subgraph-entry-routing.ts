import { Send } from '@langchain/langgraph'

type TSubgraphNodeMap = Record<string, { name?: string }>
type TFixedEdges = Record<string, string | string[]>
type TConditionalEdges = Record<string, [unknown, string[]?]>

export function collectStartDrivenAgentEntrySources(params: {
    startNodes: string[]
    nodes: TSubgraphNodeMap
    edges: TFixedEdges
    conditionalEdges: TConditionalEdges
    agentKey: string
}): Set<string> {
    const { startNodes, nodes, edges, conditionalEdges, agentKey } = params
    const nextBySource = new Map<string, string[]>()

    Object.entries(edges).forEach(([source, destinations]) => {
        const nextNodes = Array.isArray(destinations) ? destinations : [destinations]
        nextNodes.forEach((destination) => addDirectedEdge(nextBySource, source, destination))
    })

    Object.entries(conditionalEdges).forEach(([source, [, destinations]]) => {
        destinations?.forEach((destination) => addDirectedEdge(nextBySource, source, destination))
    })

    const entrySources = new Set<string>()
    const queue = startNodes
        .map((key) => nodes[key]?.name || key)
        .filter(Boolean)
    const visited = new Set<string>()

    while (queue.length) {
        const current = queue.shift()
        if (!current || visited.has(current)) {
            continue
        }
        visited.add(current)

        for (const next of nextBySource.get(current) ?? []) {
            if (next === agentKey) {
                entrySources.add(current)
                continue
            }
            if (!visited.has(next)) {
                queue.push(next)
            }
        }
    }

    return entrySources
}

export function rerouteAgentEntryTarget<T>(target: T, agentKey: string, agentStartNode: string): T {
    if (Array.isArray(target)) {
        return target.map((item) => rerouteAgentEntryTarget(item, agentKey, agentStartNode)) as T
    }

    if (target instanceof Send) {
        if (target.node === agentKey) {
            return new Send(agentStartNode, target.args) as T
        }
        return target
    }

    if (target === agentKey) {
        return agentStartNode as T
    }

    return target
}

function addDirectedEdge(nextBySource: Map<string, string[]>, source: string, destination: string) {
    const next = nextBySource.get(source) ?? []
    next.push(destination)
    nextBySource.set(source, next)
}
