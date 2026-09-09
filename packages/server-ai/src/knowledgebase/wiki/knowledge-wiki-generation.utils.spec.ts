import { mergeResolvedWikiContributions } from './knowledge-wiki-dedup'
import { KBDocumentStatusEnum, KDocumentSourceType } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { createKnowledgeWikiMapBatches, isEligibleKnowledgeWikiSource } from './knowledge-wiki-generation.utils'

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

    it('orders source chunks by their document and parent positions instead of UUIDs', () => {
        const chunks = [
            { id: 'a-later', pageContent: 'Later section', metadata: { chunkId: 'later', chunkIndex: 1 } },
            {
                id: 'b-second-child',
                pageContent: 'Second paragraph',
                metadata: { chunkId: 'second-child', parentId: 'earlier', chunkIndex: 1 }
            },
            { id: 'z-earlier', pageContent: 'Earlier section', metadata: { chunkId: 'earlier', chunkIndex: 0 } },
            {
                id: 'y-first-child',
                pageContent: 'First paragraph',
                metadata: { chunkId: 'first-child', parentId: 'earlier', chunkIndex: 0 }
            }
        ]
        const before = structuredClone(chunks)
        const batches = createKnowledgeWikiMapBatches(chunks, {
            enabled: true,
            extractionGranularity: 'standard',
            contentGenerationRequirements: '',
            extractionFocus: ''
        })

        expect(batches.flat().map((chunk) => chunk.id)).toEqual([
            'z-earlier',
            'y-first-child',
            'b-second-child',
            'a-later'
        ])
        expect(chunks).toEqual(before)
    })

    it('preserves retrieval order when old chunks have no position metadata', () => {
        const batches = createKnowledgeWikiMapBatches(
            [
                { id: 'z', pageContent: 'First' },
                { id: 'a', pageContent: 'Second' }
            ],
            {
                enabled: true,
                extractionGranularity: 'standard',
                contentGenerationRequirements: '',
                extractionFocus: ''
            }
        )
        expect(batches.flat().map((chunk) => chunk.id)).toEqual(['z', 'a'])
    })

    it('keeps the tail of an oversized source chunk within bounded extraction batches', () => {
        const content = 'a'.repeat(36_000) + '\nA separately described topic near the end.'
        const batches = createKnowledgeWikiMapBatches([{ id: 'source', pageContent: content }], {
            enabled: true,
            extractionGranularity: 'standard',
            contentGenerationRequirements: '',
            extractionFocus: ''
        })

        expect(batches).toHaveLength(2)
        expect(batches.flat().every((chunk) => chunk.id === 'source')).toBe(true)
        expect(batches.every((batch) => batch.reduce((size, chunk) => size + chunk.content.length, 0) <= 36_000)).toBe(
            true
        )
        expect(
            batches
                .flat()
                .map((chunk) => chunk.content)
                .join('')
        ).toBe(content)
    })

    it('aggregates already resolved source contributions without dropping evidence chunk ids', () => {
        const page = mergeResolvedWikiContributions([
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
                canonicalName: 'Xpert',
                aliases: ['Xpert Platform'],
                summary: 'Second',
                facts: [{ text: 'Shared fact', sourceChunkIds: ['chunk-2'] }],
                suggestedLinks: []
            }
        ])

        expect(page.aliases).toEqual(['Xpert AI', 'Xpert Platform'])
        expect(page.facts[0].sourceChunkIds).toEqual(['chunk-1', 'chunk-2'])
    })
})
