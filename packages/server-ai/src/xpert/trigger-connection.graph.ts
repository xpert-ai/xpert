import { IWFNTrigger, NodeOf, TXpertGraph, TXpertTeamDraft, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { isEqual, omit } from 'lodash'

export function connectionTrigger(graph: TXpertGraph | null | undefined, provider: string) {
    return graph?.nodes.find(
        (node): node is NodeOf<'workflow'> =>
            node.type === 'workflow' &&
            node.entity.type === WorkflowNodeTypeEnum.TRIGGER &&
            (node.entity as IWFNTrigger).from === provider
    )
}

export function triggerConfig(graph: TXpertGraph | null | undefined, provider: string) {
    return (connectionTrigger(graph, provider)?.entity as IWFNTrigger | undefined)?.config
}

// Patch only the selected trigger. Agent/model edits and other trigger drafts stay untouched.
export function patchConnectionGraph(
    graph: TXpertGraph,
    provider: string,
    key: string,
    agentKey: string,
    config: IWFNTrigger['config']
): TXpertGraph {
    const existing = connectionTrigger(graph, provider)
    if (existing) {
        return {
            ...graph,
            nodes: graph.nodes.map((node) =>
                node.key === existing.key
                    ? { ...existing, entity: { ...existing.entity, config } as IWFNTrigger }
                    : node
            )
        }
    }
    const agent = graph.nodes.find((node) => node.type === 'agent' && node.key === agentKey)
    if (!agent) throw new Error('Published primary agent is missing')
    return {
        ...graph,
        nodes: [
            ...graph.nodes,
            {
                key,
                type: 'workflow',
                position: { x: agent.position.x - 280, y: agent.position.y },
                entity: {
                    key,
                    type: WorkflowNodeTypeEnum.TRIGGER,
                    from: provider,
                    title: provider,
                    config
                } as IWFNTrigger
            }
        ],
        connections: [...graph.connections, { key: `${key}/${agentKey}`, type: 'edge', from: key, to: agentKey }]
    }
}

export function hasConnectionDraftConflict(
    graph: TXpertGraph,
    draft: TXpertTeamDraft | null | undefined,
    provider: string
) {
    if (!draft) return false
    const published = connectionTrigger(graph, provider)
    const pending = connectionTrigger(draft, provider)
    const settings = (node?: NodeOf<'workflow'>) =>
        node ? { ...node.entity, config: omit((node.entity as IWFNTrigger).config, 'enabled') } : undefined
    // A previous draft-only connect/disconnect can safely be applied to the runtime here.
    if (!isEqual(settings(published), settings(pending))) return true
    const outgoing = (value: TXpertGraph, key?: string) => value.connections.filter((edge) => edge.from === key)
    return !isEqual(outgoing(graph, published?.key), outgoing(draft, pending?.key))
}
