import {
    KnowledgeWikiPageContributionPayload,
    isKnowledgeWikiPageContributionPayload,
    isKnowledgeWikiPageSourcePayload
} from '@xpert-ai/contracts'
import {
    canMatchWikiIdentity,
    mergeResolvedWikiContributions,
    selectWikiIdentityCandidates
} from './knowledge-wiki-dedup'

describe('Wiki semantic identity policies', () => {
    const entity = {
        kind: 'entity' as const,
        entityType: 'organization' as const,
        description: 'The operations team in the north division.',
        scope: 'north division',
        identifiers: [{ namespace: 'company/team-id', value: 'north-1' }]
    }

    it('does not let identical names or vectors override conflicting entity identifiers', () => {
        expect(
            canMatchWikiIdentity(entity, {
                ...entity,
                identifiers: [{ namespace: 'company/team-id', value: 'south-2' }]
            })
        ).toBe(false)
        expect(canMatchWikiIdentity(entity, { ...entity, entityType: 'person' })).toBe(false)
    })

    it('keeps Summary source identity and Concept identity separate from entity matching', () => {
        expect(canMatchWikiIdentity({ kind: 'summary' }, { kind: 'summary' })).toBe(false)
        expect(
            canMatchWikiIdentity(entity, {
                kind: 'concept',
                definition: 'An organization.',
                domain: null,
                scope: null
            })
        ).toBe(false)
    })

    it('recalls semantic candidates with different names and preserves same-name ambiguity', () => {
        const candidates = [
            { id: 'a', canonicalName: 'North Operations', aliases: [], descriptor: entity, embedding: [1, 0] },
            {
                id: 'b',
                canonicalName: 'Northern Team',
                aliases: ['North Team'],
                descriptor: { ...entity, identifiers: [] },
                embedding: [0.9, 0.1]
            },
            {
                id: 'c',
                canonicalName: 'North Team',
                aliases: [],
                descriptor: { ...entity, identifiers: [{ namespace: 'company/team-id', value: 'other' }] },
                embedding: [1, 0]
            }
        ]
        expect(
            selectWikiIdentityCandidates(
                { canonicalName: 'North Team', aliases: [], descriptor: entity, embedding: [1, 0] },
                candidates
            ).map((item) => item.id)
        ).toEqual(['a', 'b'])
    })

    it('keeps all facts and citations after two names in one source resolve to one identity', () => {
        const first: KnowledgeWikiPageContributionPayload = {
            schemaVersion: 1,
            pageType: 'entity',
            canonicalName: 'North Team',
            aliases: [],
            summary: 'Operations.',
            facts: Array.from({ length: 100 }, (_, i) => ({ text: `Fact ${i}`, sourceChunkIds: [`chunk-${i}`] })),
            suggestedLinks: []
        }
        const second = {
            ...first,
            canonicalName: 'North Operations',
            facts: [
                { text: 'Fact 0', sourceChunkIds: ['another-chunk'] },
                { text: 'New fact', sourceChunkIds: ['last-chunk'] }
            ]
        }
        const merged = mergeResolvedWikiContributions([first, second])
        expect(merged.facts).toHaveLength(101)
        expect(isKnowledgeWikiPageSourcePayload(merged)).toBe(true)
        expect(isKnowledgeWikiPageContributionPayload(merged)).toBe(false)
        expect(merged.facts[0].sourceChunkIds).toEqual(['chunk-0', 'another-chunk'])
        expect(merged.aliases).toContain('North Operations')
        expect(first.facts[0].sourceChunkIds).toEqual(['chunk-0'])
    })
})
