import type { MapEdge, MapNode } from '../../../schema'
import type { TrailGraph, TrailLane, TrailStep } from '../../../../../../../contracts/src/ai/conversation-trail.model'

/** Keep semantic edges intact; choose a single, loaded parent only for tree/list layout. */
export function mapHierarchy(items: MapNode[], edges: MapEdge[], relations = false): MapNode[] {
    const nodes = items.map((node) => ({ ...node }))
    const lookup = new Map(nodes.map((node) => [node.id, node]))
    const priorities: MapEdge['kind'][] = relations
        ? ['reply', 'caused-by', 'root', 'branch', 'contains']
        : ['reply', 'caused-by', 'root', 'contains']
    for (const node of nodes) {
        for (const kind of priorities) {
            const parent = edges.find(
                (edge) => edge.target === node.id && edge.kind === kind && lookup.has(edge.source)
            )?.source
            if (!parent) continue
            const visited = new Set([node.id])
            let cursor: string | null = parent
            while (cursor && !visited.has(cursor)) {
                visited.add(cursor)
                cursor = lookup.get(cursor)?.parentId ?? null
            }
            if (cursor) continue
            node.parentId = parent
            break
        }
    }
    for (const node of nodes) {
        if (node.kind === 'conversation' && node.messageCount !== undefined) {
            node.messageCount = nodes.filter(
                (item) => item.kind === 'message' && item.conversationId === node.conversationId
            ).length
        }
        if (node.parentId && lookup.get(node.parentId)?.kind === 'message') lookup.get(node.parentId)!.expandable = true
    }
    return nodes
}

/** Pagination/live updates retain identities; old replies reconnect when their parent page arrives. */
export function mergeMapNodes(previous: MapNode[], incoming: MapNode[]): MapNode[] {
    const merged = [...new Map([...previous, ...incoming].map((node) => [node.id, node])).values()]
    return merged.sort((a, b) => (a.message?.sequence ?? -1) - (b.message?.sequence ?? -1))
}
export function mergeMapEdges(previous: MapEdge[], incoming: MapEdge[]): MapEdge[] {
    return [...new Map([...previous, ...incoming].map((edge) => [edge.id, edge])).values()]
}

/** Rendering adapter for the existing growth canvas. It does not manufacture execution runs or tool events. */
export function mapTrail(items: MapNode[], edges: MapEdge[], title: string): TrailGraph {
    const hierarchy = mapHierarchy(items, edges)
    const messages = hierarchy.filter((node) => node.kind === 'message' || node.kind === 'turn')
    const ids = new Set(messages.map((node) => node.id))
    const children = new Map<string, MapNode[]>()
    for (const node of messages) {
        const parent = node.parentId && ids.has(node.parentId) ? node.parentId : ''
        children.set(parent, [...(children.get(parent) ?? []), node])
    }
    const lanes: TrailLane[] = [],
        steps: TrailStep[] = []
    const visit = (node: MapNode, parentId: string | null, spawnStepId?: string) => {
        const laneId = `lane:${node.id}`
        lanes.push({
            id: laneId,
            parentId,
            spawnStepId,
            title: node.title,
            primary: parentId === null && lanes.length === 0,
            status: 'unknown'
        })
        let current: MapNode | undefined = node
        while (current) {
            steps.push({
                id: current.id,
                laneId,
                kind: 'message',
                activity: 'other',
                title: current.title,
                status: 'unknown',
                order: messages.findIndex((node) => node.id === current!.id),
                preview: current.preview,
                startedAt: current.updatedAt,
                messageId: current.anchor?.messageId,
                threadId: current.anchor?.threadId
            })
            const next: MapNode[] = children.get(current.id) ?? []
            if (next.length === 1) current = next[0]
            else {
                for (const child of next) visit(child, laneId, current.id)
                current = undefined
            }
        }
    }
    for (const root of children.get('') ?? []) visit(root, null)
    return {
        version: 1,
        layer: 'conversation',
        conversationId: messages[0]?.conversationId ?? '',
        threadId: messages[0]?.threadId ?? '',
        title,
        lanes,
        steps,
        episodes: lanes.map((lane) => ({
            id: `episode:${lane.id}`,
            laneId: lane.id,
            activity: 'other',
            stepIds: steps.filter((step) => step.laneId === lane.id).map((step) => step.id)
        })),
        coverage: [],
        live: false
    }
}
