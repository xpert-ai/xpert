import type { PipelineGraph, PipelineNode } from './bridge'

export function isCurrentNode(node: PipelineNode) {
    return node.projection.state.freshness === 'current' && node.projection.state.applicability === 'selected'
}
/** Navigation priority only. This never dispatches work or grants permission. */
export function nextActionableNode(
    graph: Pick<PipelineGraph, 'historical' | 'nodes'> & {
        definition: Pick<PipelineGraph['definition'], 'stages'>
        instance?: Pick<PipelineGraph['instance'], 'authority'>
    }
) {
    if (graph.historical) return undefined
    const stages = new Map(graph.definition.stages.map((stage) => [stage.key, stage.order]))
    return graph.nodes
        .filter(
            (node) =>
                isCurrentNode(node) &&
                ['pending', 'active'].includes(node.projection.state.lifecycle) &&
                (node.projection.presentation?.nextActionable === true ||
                    (graph.instance?.authority === 'platform' &&
                        ['work', 'human_gate', 'external_wait'].includes(node.projection.kind) &&
                        node.projection.state.readiness === 'ready'))
        )
        .sort(
            (a, b) =>
                (stages.get(a.projection.stageKey) ?? 0) - (stages.get(b.projection.stageKey) ?? 0) ||
                a.projection.key.localeCompare(b.projection.key)
        )[0]
}
export function blockedNodes(graph: Pick<PipelineGraph, 'nodes'>) {
    return graph.nodes.filter((node) => isCurrentNode(node) && node.projection.state.readiness === 'blocked')
}
