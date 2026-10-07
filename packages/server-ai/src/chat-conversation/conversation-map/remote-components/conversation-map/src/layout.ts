import dagre from '@dagrejs/dagre'
import { Position, type Edge, type Node } from '@xyflow/react'
import type { MapNode } from '../../../schema'
import type { Prefs } from './bridge'
export type TopicNode = Node<{ topic: MapNode; expanded: boolean; summary: boolean }, 'topic'>
export type NodeSize = { width: number; height: number }
/** First-pass layout estimates only; the DOM keeps intrinsic height and supplies measured sizes. */
export function nodeDimensions(kind: MapNode['kind'], style: Prefs['style']) {
    const summary = style === 'summary'
    const heights = summary
        ? { project: 144, conversation: 230, thread: 266, turn: 266 }
        : { project: 112, conversation: 142, thread: 166, turn: 166 }
    return { width: summary ? 320 : 280, height: heights[kind] }
}
export function layout(
    items: MapNode[],
    expanded: Set<string>,
    prefs: Prefs,
    sizes: ReadonlyMap<string, NodeSize> = new Map()
): { nodes: TopicNode[]; edges: Edge[] } {
    const list = visibleNodes(items, expanded),
        ids = new Set(list.map((item) => item.id))
    const graph = new dagre.graphlib.Graph()
        .setGraph({ rankdir: prefs.direction, nodesep: 36, ranksep: 72, marginx: 36, marginy: 36 })
        .setDefaultEdgeLabel(() => ({}))
    const edges: Edge[] = []
    for (const node of list) {
        const estimate = nodeDimensions(node.kind, prefs.style)
        const measured = sizes.get(node.id)
        graph.setNode(node.id, measured?.width === estimate.width ? measured : estimate)
    }
    for (const node of list) {
        const parent =
            prefs.mode === 'graph' &&
            node.kind === 'thread' &&
            node.parentThreadId &&
            ids.has(`thread:${node.parentThreadId}`)
                ? `thread:${node.parentThreadId}`
                : node.parentId
        if (parent && ids.has(parent)) {
            graph.setEdge(parent, node.id)
            edges.push({ id: `${parent}>${node.id}`, source: parent, target: node.id, type: 'smoothstep' })
        }
        if (prefs.mode === 'graph' && node.sourceConversationId && ids.has(`conversation:${node.sourceConversationId}`))
            edges.push({
                id: `source:${node.id}`,
                source: `conversation:${node.sourceConversationId}`,
                target: node.id,
                style: { strokeDasharray: '5 5' },
                type: 'smoothstep'
            })
    }
    dagre.layout(graph)
    return {
        nodes: list.map((topic) => {
            const pos = graph.node(topic.id)
            return {
                id: topic.id,
                type: 'topic',
                width: pos.width,
                height: pos.height,
                measured: sizes.get(topic.id)?.width === pos.width ? sizes.get(topic.id) : undefined,
                sourcePosition: prefs.direction === 'TB' ? Position.Bottom : Position.Right,
                targetPosition: prefs.direction === 'TB' ? Position.Top : Position.Left,
                position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
                data: { topic, expanded: expanded.has(topic.id), summary: prefs.style === 'summary' }
            }
        }),
        edges
    }
}

export function visibleNodes(items: MapNode[], expanded: Set<string>) {
    const lookup = new Map(items.map((node) => [node.id, node]))
    return items.filter((item) => {
        const visited = new Set<string>()
        let parent = item.parentId
        while (parent) {
            if (visited.has(parent) || !expanded.has(parent)) return false
            visited.add(parent)
            parent = lookup.get(parent)?.parentId ?? null
        }
        return true
    })
}

/** Preorder preserves the parent context when the same map is shown as a list. */
export type OutlineEntry = { node: MapNode; depth: number; guides: boolean[] }
export function outlineNodes(items: MapNode[], expanded: Set<string>): OutlineEntry[] {
    const visible = visibleNodes(items, expanded)
    const result: OutlineEntry[] = []
    const visited = new Set<string>()
    const visit = (node: MapNode, depth: number, ancestors: boolean[], last: boolean) => {
        if (visited.has(node.id)) return
        visited.add(node.id)
        // The project is omitted in the outline; guides begin at conversation children.
        const guides = depth > 1 ? [...ancestors, !last] : []
        result.push({ node, depth, guides })
        const children = visible.filter((item) => item.parentId === node.id)
        children.forEach((child, index) => visit(child, depth + 1, guides, index === children.length - 1))
    }
    for (const node of visible.filter((item) => !item.parentId)) visit(node, 0, [], true)
    return result
}
