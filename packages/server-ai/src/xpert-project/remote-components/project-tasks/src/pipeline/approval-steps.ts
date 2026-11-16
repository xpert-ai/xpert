import type { PipelineGraph, PipelineNode } from './bridge'

type Edge = PipelineGraph['edges'][number]
export interface ApprovalStep {
    node: PipelineNode
    outcomes: string[]
    destination: PipelineNode
}

export function approvalStageMap(graph: PipelineGraph) {
    const steps = new Map<string, ApprovalStep[]>()
    const definition = graph.definition
    if (definition.executionAuthority !== 'platform') return { graph, steps }

    const foldInto = new Map<string, string>()
    for (const node of definition.nodes) {
        if (node.kind === 'work' && node.presentation?.foldIntoApproval) {
            foldInto.set(node.key, node.presentation.foldIntoApproval)
        }
    }
    if (!foldInto.size) return { graph, steps }

    const approvals = new Map(
        definition.nodes.filter((node) => node.kind === 'human_gate').map((node) => [node.key, node])
    )
    const nodes = new Map(graph.nodes.map((n) => [n.projection.key, n]))
    const incoming = new Map<string, Edge[]>(),
        outgoing = new Map<string, Edge[]>()
    for (const edge of graph.edges) {
        incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    }
    const folded = new Set<string>()
    const bypasses: Edge[] = []
    for (const node of graph.nodes) {
        const p = node.projection
        const approvalKey = foldInto.get(p.nodeKey)
        if (!approvalKey) continue
        const gate = approvals.get(approvalKey)
        const before = incoming.get(p.key) ?? [],
            after = outgoing.get(p.key) ?? []
        const parent = nodes.get(before[0]?.from),
            destination = nodes.get(after[0]?.to)
        if (
            !gate ||
            !parent ||
            parent.projection.nodeKey !== gate.key ||
            !before.every((edge) => edge.from === parent.projection.key && edge.outcome) ||
            after.length !== 1 ||
            !destination
        )
            continue
        const next = after[0]
        if (next.outcome || before.some((e) => !gate.outcomes.includes(e.outcome!))) continue
        const selected = before.find((edge) => edge.selection === 'selected')
        const selection =
            next.selection === 'excluded' || before.every((edge) => edge.selection === 'excluded')
                ? 'excluded'
                : selected && next.selection === 'selected'
                  ? 'selected'
                  : 'undetermined'
        folded.add(p.key)
        steps.set(parent.id, [
            ...(steps.get(parent.id) ?? []),
            {
                node,
                destination,
                outcomes: gate.outcomes
                    .filter((key) => before.some((e) => e.outcome === key))
                    .map((key) => gate.outcomeLabels?.[key] ?? key)
            }
        ])
        bypasses.push({
            key: JSON.stringify(['approval-step', p.key, next.key]),
            from: parent.projection.key,
            to: next.to,
            selection
        })
    }
    if (!folded.size) return { graph, steps }

    const edges = [...graph.edges.filter((e) => !folded.has(e.from) && !folded.has(e.to)), ...bypasses]
    const visible = graph.nodes.filter((n) => !folded.has(n.projection.key))
    const used = new Set(visible.map((n) => n.projection.laneKey))
    const foldedLanes = new Set(
        graph.nodes.filter((n) => folded.has(n.projection.key)).map((n) => n.projection.laneKey)
    )
    const lanes = definition.lanes.filter((l) => !foldedLanes.has(l.key) || used.has(l.key))
    return { graph: { ...graph, nodes: visible, edges, definition: { ...definition, lanes } }, steps }
}
