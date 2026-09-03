import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, KnowledgeFilterDiagnostics } from '@xpert-ai/contracts'
import { resolveKnowledgeDocumentKey } from './document'
import { LegacyWeightedFusion } from './legacy-weighted.fusion'
import { KnowledgeRetrievalBatch, KnowledgeRetrieverSource } from './types'

const diagnostics: KnowledgeFilterDiagnostics = {
    filterVersion: 2,
    filterStatus: 'not_applied',
    hitCount: 0
}

function document(pageContent: string, metadata: DocumentMetadata): DocumentInterface<DocumentMetadata> {
    return { pageContent, metadata }
}

function batch(
    source: KnowledgeRetrieverSource,
    documents: DocumentInterface<DocumentMetadata>[]
): KnowledgeRetrievalBatch {
    return {
        source,
        candidates: documents.map((document, index) => ({ document, rank: index + 1 })),
        diagnostics: { ...diagnostics }
    }
}

describe('LegacyWeightedFusion', () => {
    const fusion = new LegacyWeightedFusion()

    it('deduplicates by chunk id and preserves the legacy metadata and score rules', () => {
        const results = fusion.fuse(
            [
                batch('vector', [
                    document('vector content', {
                        chunkId: 'chunk-1',
                        score: 0.8,
                        relevanceScore: 0.7,
                        sourceMarker: 'vector',
                        vectorOnly: true
                    })
                ]),
                batch('graph', [
                    document('graph content', {
                        chunkId: 'chunk-1',
                        score: 0.4,
                        graphScore: 0.4,
                        sourceMarker: 'graph',
                        graphOnly: true
                    })
                ])
            ],
            { graphWeight: 0.25 }
        )

        expect(results).toHaveLength(1)
        expect(results[0].pageContent).toBe('graph content')
        expect(results[0].metadata).toEqual(
            expect.objectContaining({
                chunkId: 'chunk-1',
                vectorScore: 0.7,
                graphScore: 0.4,
                sourceMarker: 'graph',
                vectorOnly: true,
                graphOnly: true
            })
        )
        expect(results[0].metadata.score).toBeCloseTo(0.625)
        expect(results[0].metadata.relevanceScore).toBeCloseTo(0.625)
    })

    it('keeps missing branch scores at zero and clamps graph weight', () => {
        const vector = batch('vector', [document('vector', { chunkId: 'vector', score: 0.8 })])
        const graph = batch('graph', [document('graph', { chunkId: 'graph', graphScore: 0.6 })])

        const vectorOnly = fusion.fuse([vector], { graphWeight: 0.25 })
        const clampedToVector = fusion.fuse([vector, graph], { graphWeight: -1 })
        const clampedToGraph = fusion.fuse([vector, graph], { graphWeight: 2 })

        expect(vectorOnly[0].metadata.score).toBeCloseTo(0.6)
        expect(clampedToVector.map((item) => item.metadata.chunkId)).toEqual(['vector', 'graph'])
        expect(clampedToVector[0].metadata.score).toBeCloseTo(0.8)
        expect(clampedToGraph.map((item) => item.metadata.chunkId)).toEqual(['graph', 'vector'])
        expect(clampedToGraph[0].metadata.score).toBeCloseTo(0.6)
    })

    it('keeps the legacy id and page-content key fallbacks', () => {
        const byId: DocumentInterface & { id: string } = {
            id: 'row-1',
            pageContent: 'content by id',
            metadata: {}
        }
        const byContent: DocumentInterface = {
            pageContent: 'same content',
            metadata: {}
        }

        expect(resolveKnowledgeDocumentKey(byId)).toBe('row-1')
        expect(resolveKnowledgeDocumentKey(byContent)).toBe('same content')
    })
})
