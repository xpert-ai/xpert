import { validateWikiFolderMove, selectWikiGraph } from './knowledge-wiki-organization.utils'

describe('Wiki organization behavior', () => {
    const folders = [
        { id: 'a', parentId: null },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' }
    ]
    it('rejects moving a folder under its descendant or itself', () => {
        expect(() => validateWikiFolderMove(folders, 'a', 'c')).toThrow()
        expect(() => validateWikiFolderMove(folders, 'a', 'a')).toThrow()
        expect(() => validateWikiFolderMove(folders, 'b', null)).not.toThrow()
    })
    it('rejects a missing or cross-knowledgebase parent', () => {
        expect(() => validateWikiFolderMove(folders, 'b', 'foreign')).toThrow()
    })
    it('keeps directed edges and traverses incoming and outgoing links without dangling endpoints', () => {
        const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
        const edges = [
            { id: 'ab', source: 'a', target: 'b' },
            { id: 'cb', source: 'c', target: 'b' },
            { id: 'cd', source: 'c', target: 'd' }
        ]
        const one = selectWikiGraph(nodes, edges, 'b', 1, 10)
        expect(one.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])
        expect(one.edges.map((edge) => edge.id)).toEqual(['ab', 'cb'])
        const limited = selectWikiGraph(nodes, edges, 'b', 2, 2)
        expect(limited.truncated).toBe(true)
        expect(limited.nodes.some((node) => node.id === 'b')).toBe(true)
        expect(
            limited.edges.every(
                (edge) =>
                    limited.nodes.some((node) => node.id === edge.source) &&
                    limited.nodes.some((node) => node.id === edge.target)
            )
        ).toBe(true)
    })
})
