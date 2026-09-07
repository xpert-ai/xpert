import {
    createKnowledgeWikiIndexPageKey,
    createKnowledgeWikiMappedPageIdentity,
    normalizeKnowledgeWikiCanonicalName
} from './knowledge-wiki-identity'

describe('knowledge Wiki page identity', () => {
    it('merges entity and concept pages only by page type and normalized canonical name', () => {
        expect(normalizeKnowledgeWikiCanonicalName('  Weighted   RRF ')).toBe('weighted rrf')
        expect(createKnowledgeWikiMappedPageIdentity('entity', 'Weighted RRF', 'document-1').pageKey).toBe(
            createKnowledgeWikiMappedPageIdentity('entity', ' weighted  rrf ', 'document-2').pageKey
        )
        expect(createKnowledgeWikiMappedPageIdentity('concept', 'Weighted RRF', 'document-1').pageKey).not.toBe(
            createKnowledgeWikiMappedPageIdentity('entity', 'Weighted RRF', 'document-1').pageKey
        )
    })

    it('keeps summary identity stable and separate per source document', () => {
        const first = createKnowledgeWikiMappedPageIdentity('summary', 'Repeated title', 'document-1')
        const second = createKnowledgeWikiMappedPageIdentity('summary', 'Repeated title', 'document-2')

        expect(first.pageKey).not.toBe(second.pageKey)
        expect(first.pageKey).toBe('summary:document-1')
        expect(first.slug).not.toBe(second.slug)
    })

    it('uses fixed deterministic keys for generated index pages', () => {
        expect(createKnowledgeWikiIndexPageKey('root')).toBe('index:root')
        expect(createKnowledgeWikiIndexPageKey('concept')).toBe('index:concept')
    })
})
