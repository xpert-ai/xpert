import { layout, visibleNodes, outlineNodes } from './layout'
import type { MapNode } from '../../../schema'
const nodes: MapNode[] = [
    { id: 'p', kind: 'project', parentId: null, title: 'Project', preview: '', expandable: true },
    { id: 'conversation:a', kind: 'conversation', parentId: 'p', title: 'A', preview: '', expandable: true },
    {
        id: 'thread:main',
        kind: 'thread',
        parentId: 'conversation:a',
        threadId: 'main',
        title: 'Main',
        preview: '',
        expandable: true
    },
    {
        id: 'thread:side',
        kind: 'thread',
        parentId: 'conversation:a',
        threadId: 'side',
        parentThreadId: 'main',
        title: 'Side',
        preview: '',
        expandable: true
    },
    {
        id: 'conversation:b',
        kind: 'conversation',
        parentId: 'p',
        sourceConversationId: 'a',
        title: 'B',
        preview: '',
        expandable: true
    }
]
const prefs = {
    mode: 'tree' as const,
    direction: 'TB' as const,
    style: 'compact' as const,
    showHistory: false,
    showShared: false
}
describe('topic map layout semantics', () => {
    it('collapses descendants and preserves business identities across layout changes', () => {
        expect(visibleNodes(nodes, new Set(['p'])).map((n) => n.id)).toEqual(['p', 'conversation:a', 'conversation:b'])
        const expanded = new Set(nodes.map((n) => n.id))
        const vertical = layout(nodes, expanded, prefs),
            horizontal = layout(nodes, expanded, { ...prefs, direction: 'LR' })
        expect(vertical.nodes.map((n) => n.id)).toEqual(horizontal.nodes.map((n) => n.id))
        expect(vertical.nodes[1].position).not.toEqual(horizontal.nodes[1].position)
        expect(vertical.nodes.every((node) => node.sourcePosition === 'bottom' && node.targetPosition === 'top')).toBe(
            true
        )
        expect(
            horizontal.nodes.every((node) => node.sourcePosition === 'right' && node.targetPosition === 'left')
        ).toBe(true)
    })
    it('keeps list descendants next to their conversation with an explicit depth', () => {
        const outline = outlineNodes(nodes, new Set(nodes.map((node) => node.id)))
        expect(outline.map(({ node }) => node.id)).toEqual([
            'p',
            'conversation:a',
            'thread:main',
            'thread:side',
            'conversation:b'
        ])
        expect(outline.map(({ depth }) => depth)).toEqual([0, 1, 2, 2, 1])
        expect(outline.map(({ guides }) => guides)).toEqual([[], [], [true], [false], []])
        const withMessage: MapNode[] = [
            ...nodes,
            {
                id: 'turn:main:h',
                kind: 'turn',
                parentId: 'thread:main',
                title: 'Question',
                preview: '',
                expandable: false
            }
        ]
        const descendants = outlineNodes(withMessage, new Set(nodes.map((node) => node.id)))
        expect(descendants.find(({ node }) => node.id === 'turn:main:h')?.guides).toEqual([true, false])
        expect(descendants.find(({ node }) => node.id === 'conversation:b')?.guides).toEqual([])
    })
    it.each(['TB', 'LR'] as const)('keeps richer summary cards separated in the %s layout', (direction) => {
        const expanded = new Set(nodes.map((node) => node.id))
        const compact = layout(nodes, expanded, { ...prefs, direction })
        const summary = layout(nodes, expanded, { ...prefs, direction, style: 'summary' })
        expect(summary.nodes.map((node) => node.id)).toEqual(compact.nodes.map((node) => node.id))
        summary.nodes.forEach((node, index) => {
            expect(node.width).toBeGreaterThan(compact.nodes[index].width!)
            expect(node.height).toBeGreaterThan(compact.nodes[index].height!)
            summary.nodes.slice(index + 1).forEach((other) => {
                const separate =
                    node.position.x + node.width! <= other.position.x ||
                    other.position.x + other.width! <= node.position.x ||
                    node.position.y + node.height! <= other.position.y ||
                    other.position.y + other.height! <= node.position.y
                expect(separate).toBe(true)
            })
        })
    })
    it.each(['TB', 'LR'] as const)(
        'reflows %s around measured content and discards sizes from a different width',
        (direction) => {
            const expanded = new Set(nodes.map((node) => node.id))
            const sizes = new Map(nodes.map((node, index) => [node.id, { width: 320, height: 90 + index * 35 }]))
            const measured = layout(nodes, expanded, { ...prefs, direction, style: 'summary' }, sizes)
            expect(measured.nodes.map((node) => node.height)).toEqual([90, 125, 160, 195, 230])
            measured.nodes.forEach((node, index) => {
                expect(node.measured).toEqual(sizes.get(node.id))
                measured.nodes.slice(index + 1).forEach((other) => {
                    expect(
                        node.position.x + node.width! <= other.position.x ||
                            other.position.x + other.width! <= node.position.x ||
                            node.position.y + node.height! <= other.position.y ||
                            other.position.y + other.height! <= node.position.y
                    ).toBe(true)
                })
            })
            sizes.set('conversation:a', { width: 320, height: 340 })
            const grown = layout(nodes, expanded, { ...prefs, direction, style: 'summary' }, sizes)
            const parent = grown.nodes.find((node) => node.id === 'conversation:a')!
            const child = grown.nodes.find((node) => node.id === 'thread:main')!
            expect(parent.height).toBe(340)
            expect(
                direction === 'TB'
                    ? child.position.y >= parent.position.y + parent.height!
                    : child.position.x >= parent.position.x + parent.width!
            ).toBe(true)
            const compact = layout(nodes, expanded, { ...prefs, direction }, sizes)
            expect(compact.nodes.every((node) => node.width === 280 && !node.measured)).toBe(true)
        }
    )
    it('uses ancestry only in relation mode and never treats independent provenance as containment', () => {
        const expanded = new Set(nodes.map((n) => n.id))
        const tree = layout(nodes, expanded, prefs),
            graph = layout(nodes, expanded, { ...prefs, mode: 'graph' })
        expect(tree.edges.find((e) => e.target === 'thread:side')?.source).toBe('conversation:a')
        expect(graph.edges.find((e) => e.target === 'thread:side')?.source).toBe('thread:main')
        expect(graph.edges.find((e) => e.id === 'source:conversation:b')?.style?.strokeDasharray).toBe('5 5')
        expect(graph.edges.some((e) => e.source === 'p' && e.target === 'conversation:b')).toBe(true)
        expect(
            layout(
                nodes.filter((n) => n.id !== 'conversation:a'),
                expanded,
                { ...prefs, mode: 'graph' }
            ).edges.some((e) => e.id === 'source:conversation:b')
        ).toBe(false)
    })
})
