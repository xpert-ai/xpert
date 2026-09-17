import { buildGraphView } from './graph-explorer-model'
import type { IKnowledgeGraphEntity, IKnowledgeGraphRelation } from '@xpert-ai/contracts'

const node = (id: string, type = 'assembly'): IKnowledgeGraphEntity => ({ id, name: id, normalizedName: id, type })
const edge = (source: string, target: string, type = 'contains'): IKnowledgeGraphRelation => ({
    id: `${source}-${target}`,
    sourceEntityId: source,
    targetEntityId: target,
    type
})

describe('graph exploration', () => {
    const nodes = Array.from({ length: 600 }, (_, i) => node(String(i)))
    const edges = nodes.slice(1).map((item, i) => edge(String(i), item.id))

    it('loads all matching nodes with no hidden 250-node limit and includes every connecting relation', () => {
        const result = buildGraphView(nodes, edges, { loadAll: true, take: 1 })
        expect(result.nodes).toHaveLength(600)
        expect(result.edges).toHaveLength(599)
        expect(result.remainingNodes).toBe(0)
    })

    it('honors depth 15, retains the focus, and counts the reachable nodes beyond the current depth', () => {
        const result = buildGraphView(nodes, edges, { focusEntityId: '0', depth: 15, take: 80 })
        expect(result.nodes.map((item) => item.id)).toEqual(nodes.slice(0, 16).map((item) => item.id))
        expect(result.edges).toHaveLength(15)
        expect(result.remainingNodes).toBe(584)
    })

    it('expands exactly one hop without losing already visible nodes or truncating new neighbors', () => {
        const result = buildGraphView(nodes, edges, {
            focusEntityId: '0',
            depth: 1,
            take: 1,
            visibleEntityIds: ['0', '1', '2', '3'],
            expandedEntityIds: ['3']
        })
        expect(result.nodes.map((item) => item.id)).toEqual(['0', '1', '2', '3', '4'])
        expect(result.nodes.find((item) => item.id === '4').unloadedNeighborCount).toBe(1)
        expect(result.edges).toHaveLength(4)
    })

    it('removes disconnected feature nodes when only assembly relations are requested', () => {
        const result = buildGraphView(
            [node('root'), node('part'), node('feature')],
            [edge('root', 'part'), edge('part', 'feature', 'has_feature')],
            { relationType: 'contains', loadAll: true }
        )
        expect(result.nodes.map((item) => item.id)).toEqual(['root', 'part'])
        expect(result.totalNodes).toBe(2)
        expect(result.edges).toHaveLength(1)
    })

    it('terminates on cycles and preserves a focus with no visible neighbors', () => {
        const result = buildGraphView([node('a'), node('b')], [edge('a', 'b'), edge('b', 'a')], {
            focusEntityId: 'a',
            depth: 100
        })
        expect(result.nodes).toHaveLength(2)
        expect(buildGraphView([node('a')], [], { focusEntityId: 'a', depth: 15 }).nodes).toHaveLength(1)
    })
})
