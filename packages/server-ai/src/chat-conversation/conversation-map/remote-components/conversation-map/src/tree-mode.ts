import type { MapNode } from '../../../schema'

export function mapRepresentation(mode: string, search: string): 'segments' | 'turns' {
    return mode === 'tree' && !search ? 'segments' : 'turns'
}

/** All descendants arrive together; expanding a segment never requests a full message list. */
export function registerSegments(
    nodes: MapNode[],
    expanded: Set<string>,
    loaded: Set<string>,
    previous: ReadonlySet<string> = new Set()
) {
    for (const node of nodes) {
        if (node.kind !== 'segment') continue
        loaded.add(node.id)
        if (!previous.has(node.id)) expanded.add(node.id)
    }
}

export function segmentConversationTarget(node: MapNode, threadId: string): MapNode {
    if (!node.segmentThreads?.some((thread) => thread.threadId === threadId)) throw new Error('Invalid segment branch')
    return { ...node, threadId, messageId: node.lastHumanMessage?.id ?? node.endMessageId }
}

/** The server splits at source replies. Copies retain their own identity and link only to loaded source nodes. */
export function treeProjection(items: MapNode[]): MapNode[] {
    const projected = items.map((node) => ({ ...node }))
    const owners = new Map(
        projected
            .filter((node) => node.kind === 'segment' && node.endMessageId)
            .map((node) => [`${node.conversationId}:${node.endMessageId}`, node.id])
    )
    const lookup = new Map(projected.map((node) => [node.id, node]))
    for (const node of projected) {
        if (node.kind !== 'conversation' || !node.sourceConversationId || !node.sourceMessageId) continue
        const parent = owners.get(`${node.sourceConversationId}:${node.sourceMessageId}`)
        if (!parent) continue
        const visited = new Set([node.id])
        let cursor: string | null = parent
        while (cursor && !visited.has(cursor)) {
            visited.add(cursor)
            cursor = lookup.get(cursor)?.parentId ?? null
        }
        if (cursor) continue
        node.parentId = parent
        lookup.get(parent)!.expandable = true
    }
    return projected
}
