import {
    createKnowledgeWikiIndexPageKey,
    createKnowledgeWikiResolvedPageIdentity,
    normalizeKnowledgeWikiCanonicalName
} from './knowledge-wiki-identity'

describe('knowledge Wiki page identity', () => {
    it('uses the resolved stable identity instead of merging by normalized name', () => {
        expect(normalizeKnowledgeWikiCanonicalName('  Weighted   RRF ')).toBe('weighted rrf')
        const first = createKnowledgeWikiResolvedPageIdentity('entity', 'North Team', 'doc-1', 'north')
        const alias = createKnowledgeWikiResolvedPageIdentity('entity', 'Northern Operations', 'doc-2', 'north')
        const namesake = createKnowledgeWikiResolvedPageIdentity('entity', 'North Team', 'doc-3', 'south')
        expect(first.pageKey).toBe(alias.pageKey)
        expect(first.pageKey).not.toBe(namesake.pageKey)
    })

    it('keeps summary identity stable and separate per source document', () => {
        const first = createKnowledgeWikiResolvedPageIdentity('summary', 'Report', 'doc-1', 'page-1')
        const renamed = createKnowledgeWikiResolvedPageIdentity('summary', 'Renamed report', 'doc-1', 'page-1')
        const second = createKnowledgeWikiResolvedPageIdentity('summary', 'Report', 'doc-2', 'page-2')
        expect(first.pageKey).toBe(renamed.pageKey)
        expect(first.pageKey).toBe('summary:doc-1')
        expect(first.pageKey).not.toBe(second.pageKey)
        expect(first.slug).not.toBe(second.slug)
    })

    it('uses fixed deterministic keys for generated index pages', () => {
        expect(createKnowledgeWikiIndexPageKey('root')).toBe('index:root')
        expect(createKnowledgeWikiIndexPageKey('concept')).toBe('index:concept')
    })
})
