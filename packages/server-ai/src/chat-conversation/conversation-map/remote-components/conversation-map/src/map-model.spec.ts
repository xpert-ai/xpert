import type { MapEdge, MapNode } from '../../../schema'
import { mapHierarchy, mapTrail, mergeMapEdges, mergeMapNodes } from './map-model'
import { layout, outlineNodes } from './layout'
const node = (id: string, sequence: number): MapNode => ({
    id,
    kind: 'message',
    title: id,
    parentId: 'conversation',
    preview: id,
    expandable: false,
    capabilities: ['locate'],
    message: { sequence, senderId: id, recipientIds: [], intent: 'message', contentKinds: [] }
})
const conversation: MapNode = {
    id: 'conversation',
    kind: 'conversation',
    title: 'Discussion',
    parentId: null,
    preview: '',
    expandable: true,
    capabilities: []
}
const request = node('request', 1),
    other = node('other', 2),
    reply = node('reply', 3)
const edges: MapEdge[] = [{ id: 'reply', source: request.id, target: reply.id, kind: 'reply' }]

it('retains a filtered reply and reconnects it to its parent when an older page loads', () => {
    const filtered = mapHierarchy([conversation, reply], edges)
    expect(filtered[1].parentId).toBe('conversation')
    expect(outlineNodes(filtered, new Set(['conversation'])).map(({ node }) => node.id)).toEqual([
        'conversation',
        'reply'
    ])
    const all = mapHierarchy(mergeMapNodes(filtered, [request]), edges)
    expect(all.find((node) => node.id === 'reply')?.parentId).toBe('request')
    expect(all.find((node) => node.id === 'request')?.expandable).toBe(true)
    expect(reply.parentId).toBe('conversation')
})
it('renders interleaved topics in one shared outline without making chronology a causal edge', () => {
    const nodes = mapHierarchy([conversation, request, other, reply], edges)
    expect(outlineNodes(nodes, new Set(nodes.map((node) => node.id))).map(({ node }) => node.id)).toEqual([
        'conversation',
        'request',
        'reply',
        'other'
    ])
    expect(nodes.find((node) => node.id === 'other')?.parentId).toBe('conversation')
})
it('merges refreshes and older pages without losing identity, order or relation types', () => {
    const nodes = mergeMapNodes([reply], [request, { ...reply, preview: 'Updated' }])
    expect(nodes.map((node) => node.id)).toEqual(['request', 'reply'])
    expect(nodes[1].preview).toBe('Updated')
    expect(mergeMapEdges(edges, edges)).toEqual(edges)
})
it('ignores cyclic relation candidates rather than hiding the entire discussion', () => {
    const nodes = mapHierarchy(
        [conversation, request, reply],
        [...edges, { id: 'cycle', kind: 'reply', source: 'reply', target: 'request' }]
    )
    expect(outlineNodes(nodes, new Set(nodes.map((node) => node.id)))).toHaveLength(3)
})
it('feeds all public speakers and only real reply branches into the existing growth canvas', () => {
    const graph = mapTrail(
        [conversation, request, other, reply, node('second-reply', 4)],
        [...edges, { id: 'second', source: 'request', target: 'second-reply', kind: 'reply' }],
        'Meeting'
    )
    expect(graph.steps.map((step) => step.id).sort()).toEqual(['other', 'reply', 'request', 'second-reply'])
    expect(graph.steps.every((step) => !step.executionId && !step.toolCallId && step.kind === 'message')).toBe(true)
    expect(graph.lanes.find((lane) => lane.id === 'lane:other')?.parentId).toBeNull()
    expect(graph.lanes.find((lane) => lane.id === 'lane:reply')).toMatchObject({
        parentId: 'lane:request',
        spawnStepId: 'request'
    })
    expect(graph.steps.find((step) => step.id === 'other')?.order).toBe(1)
})
it('uses the shared graph layout for message nodes in either orientation', () => {
    const nodes = mapHierarchy([conversation, request, other, reply], edges)
    for (const direction of ['LR', 'TB'] as const) {
        const graph = layout(
            nodes,
            new Set(nodes.map((node) => node.id)),
            { direction, mode: 'graph', style: 'summary', showHistory: false, showShared: false },
            new Map(),
            edges
        )
        expect(graph.edges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ source: 'request', target: 'reply', data: { kind: 'reply' } })
            ])
        )
        expect(graph.nodes).toHaveLength(4)
    }
})
