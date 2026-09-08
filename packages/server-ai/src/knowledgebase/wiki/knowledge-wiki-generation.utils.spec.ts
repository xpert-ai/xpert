import { KBDocumentStatusEnum, KDocumentSourceType } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import {
    createKnowledgeWikiMapBatches,
    isEligibleKnowledgeWikiSource,
    mergeKnowledgeWikiMapPages
} from './knowledge-wiki-generation.utils'

describe('knowledge Wiki generation utilities', () => {
    it('excludes unfinished, deleted, and system-managed sources', () => {
        const eligible = Object.assign(new KnowledgeDocument(), {
            status: KBDocumentStatusEnum.FINISH,
            sourceType: KDocumentSourceType.FILE,
            contentHash: 'hash-1',
            disabled: false,
            deletedAt: null,
            hardDeletePendingAt: null,
            metadata: null
        })

        expect(isEligibleKnowledgeWikiSource(eligible)).toBe(true)
        expect(
            isEligibleKnowledgeWikiSource(Object.assign(new KnowledgeDocument(), eligible, { deletedAt: new Date() }))
        ).toBe(false)
        expect(
            isEligibleKnowledgeWikiSource(
                Object.assign(new KnowledgeDocument(), eligible, { metadata: { systemManaged: true } })
            )
        ).toBe(false)
    })

    it('uses a smaller character envelope for exhaustive extraction', () => {
        const chunks = [
            { id: 'chunk-1', pageContent: 'a'.repeat(15_000) },
            { id: 'chunk-2', pageContent: 'b'.repeat(15_000) }
        ]

        expect(
            createKnowledgeWikiMapBatches(chunks, {
                enabled: true,
                extractionGranularity: 'exhaustive',
                contentGenerationRequirements: '',
                extractionFocus: ''
            })
        ).toHaveLength(2)
        expect(
            createKnowledgeWikiMapBatches(chunks, {
                enabled: true,
                extractionGranularity: 'standard',
                contentGenerationRequirements: '',
                extractionFocus: ''
            })
        ).toHaveLength(1)
    })

    it('merges exact page identities without dropping evidence chunk ids', () => {
        const pages = mergeKnowledgeWikiMapPages([
            {
                schemaVersion: 1,
                pageType: 'entity',
                canonicalName: 'Xpert',
                aliases: ['Xpert AI'],
                summary: 'First',
                facts: [{ text: 'Shared fact', sourceChunkIds: ['chunk-1'] }],
                suggestedLinks: []
            },
            {
                schemaVersion: 1,
                pageType: 'entity',
                canonicalName: ' xpert ',
                aliases: ['Xpert Platform'],
                summary: 'Second',
                facts: [{ text: 'Shared fact', sourceChunkIds: ['chunk-2'] }],
                suggestedLinks: []
            }
        ])

        expect(pages).toHaveLength(1)
        expect(pages[0].aliases).toEqual(['Xpert AI', 'Xpert Platform'])
        expect(pages[0].facts[0].sourceChunkIds).toEqual(['chunk-1', 'chunk-2'])
    })
})
