import { applyKnowledgeWikiRelations } from './knowledge-wiki-content-quality'
import { KnowledgeWikiMapModelOutput } from './types'

const pages: KnowledgeWikiMapModelOutput['pages'] = ['Knowledge management', 'Tacit knowledge'].map((name) => ({
    schemaVersion: 1,
    pageType: 'concept',
    identity: { kind: 'concept', definition: name, domain: null, scope: null },
    canonicalName: name,
    aliases: [],
    summary: name,
    facts: [{ text: 'Knowledge management includes making tacit knowledge explicit.', sourceChunkIds: ['chunk'] }],
    suggestedLinks: []
}))

describe('Wiki content quality', () => {
    it('adds a directed link backed by the supplied source fact', () => {
        const output = applyKnowledgeWikiRelations(
            { pages },
            {
                links: [{ sourceIndex: 0, targetIndex: 1, factIndices: [0], label: 'includes' }]
            }
        )
        expect(output.pages[0].suggestedLinks).toEqual([
            { targetType: 'concept', targetCanonicalName: 'Tacit knowledge', label: 'includes' }
        ])
        expect(output.pages[1].suggestedLinks).toEqual([])
        expect(pages[0].suggestedLinks).toEqual([])
    })

    it.each([
        { sourceIndex: 0, targetIndex: 99, factIndices: [0], label: 'invented target' },
        { sourceIndex: 99, targetIndex: 1, factIndices: [0], label: 'invented source' },
        { sourceIndex: 0, targetIndex: 0, factIndices: [0], label: 'self' },
        { sourceIndex: 0, targetIndex: 1, factIndices: [99], label: 'invented evidence' },
        { sourceIndex: 0, targetIndex: 1, factIndices: [], label: 'no evidence' }
    ])('rejects invalid relation references: %j', (link) => {
        expect(() => applyKnowledgeWikiRelations({ pages }, { links: [link] })).toThrow()
    })

    it('allows unrelated pages to remain unlinked and deduplicates repeated suggestions', () => {
        expect(applyKnowledgeWikiRelations({ pages }, { links: [] }).pages).toEqual(pages)
        const link = { sourceIndex: 0, targetIndex: 1, factIndices: [0], label: 'includes' }
        expect(applyKnowledgeWikiRelations({ pages }, { links: [link, link] }).pages[0].suggestedLinks).toHaveLength(1)
    })
})
