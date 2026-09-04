import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, KnowledgeFilterDiagnostics } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { WeightedRrfFusion } from './weighted-rrf.fusion'
import { KnowledgeRetrievalBatch, KnowledgeRetrieverSource } from './types'

jest.mock('i18next', () => ({
    t: jest.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key)
}))

const diagnostics: KnowledgeFilterDiagnostics = {
    filterVersion: 2,
    filterStatus: 'not_applied',
    hitCount: 0
}

function document(
    chunkId: string,
    pageContent = chunkId,
    metadata: Partial<DocumentMetadata> = {}
): DocumentInterface<DocumentMetadata> {
    return { pageContent, metadata: { ...metadata, chunkId } }
}

function batch(
    source: KnowledgeRetrieverSource,
    documents: DocumentInterface<DocumentMetadata>[],
    ranks: number[] = []
): KnowledgeRetrievalBatch {
    return {
        source,
        candidates: documents.map((document, index) => ({ document, rank: ranks[index] ?? index + 1 })),
        diagnostics: { ...diagnostics }
    }
}

describe('WeightedRrfFusion', () => {
    const fusion = new WeightedRrfFusion()

    beforeEach(() => {
        jest.mocked(t).mockClear()
    })

    it('fuses two ranked lists and deduplicates overlapping chunks', () => {
        const results = fusion.fuse(
            [batch('vector', [document('a'), document('b')]), batch('graph', [document('b'), document('c')])],
            {
                rankConstant: 60,
                weights: { vector: 1, graph: 1 }
            }
        )

        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['b', 'a', 'c'])
        expect(results[0].metadata.relevanceScore).toBeCloseTo(1 / 62 + 1 / 61)
        expect(results[1].metadata.relevanceScore).toBeCloseTo(1 / 61)
        expect(results[2].metadata.relevanceScore).toBeCloseTo(1 / 62)
    })

    it('fuses three ranked lists with overlapping and source-only chunks', () => {
        const results = fusion.fuse(
            [
                batch('vector', [document('a'), document('b'), document('d')]),
                batch('graph', [document('b'), document('c')]),
                batch('keyword', [document('c'), document('b'), document('e')])
            ],
            {
                rankConstant: 10,
                weights: { vector: 1, graph: 1, keyword: 1 }
            }
        )

        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['b', 'c', 'a', 'd', 'e'])
        expect(results[0].metadata.rrfScore).toBeCloseTo(1 / 12 + 1 / 11 + 1 / 12)
        expect(results[1].metadata.rrfScore).toBeCloseTo(1 / 12 + 1 / 11)
        expect(results[2].metadata.rrfScore).toBeCloseTo(1 / 11)
        expect(results[3].metadata.rrfScore).toBeCloseTo(1 / 13)
        expect(results[4].metadata.rrfScore).toBeCloseTo(1 / 13)
    })

    it('changes ordering when source weights change', () => {
        const batches = [
            batch('vector', [document('a'), document('b')]),
            batch('graph', [document('b'), document('a')])
        ]

        const vectorFavored = fusion.fuse(batches, {
            rankConstant: 0,
            weights: { vector: 3, graph: 1 }
        })
        const graphFavored = fusion.fuse(batches, {
            rankConstant: 0,
            weights: { vector: 1, graph: 3 }
        })

        expect(vectorFavored.map(({ metadata }) => metadata.chunkId)).toEqual(['a', 'b'])
        expect(graphFavored.map(({ metadata }) => metadata.chunkId)).toEqual(['b', 'a'])
        expect(vectorFavored[0].metadata.rrfScore).toBeCloseTo(3 / 1 + 1 / 2)
        expect(graphFavored[0].metadata.rrfScore).toBeCloseTo(1 / 2 + 3 / 1)
    })

    it('handles one empty source and all-empty input', () => {
        const oneSourceEmpty = fusion.fuse([batch('vector', []), batch('graph', [document('graph')])], {
            rankConstant: 60,
            weights: { vector: 1, graph: 1 }
        })

        expect(oneSourceEmpty.map(({ metadata }) => metadata.chunkId)).toEqual(['graph'])
        expect(fusion.fuse([], { rankConstant: 60, weights: {} })).toEqual([])
        expect(
            fusion.fuse([batch('vector', []), batch('graph', []), batch('keyword', [])], {
                rankConstant: 60,
                weights: { vector: 1, graph: 1, keyword: 1 }
            })
        ).toEqual([])
    })

    it('uses first encounter order as the deterministic tie breaker', () => {
        const vectorFirst = fusion.fuse([batch('vector', [document('a')]), batch('graph', [document('b')])], {
            rankConstant: 60,
            weights: { vector: 1, graph: 1 }
        })
        const graphFirst = fusion.fuse([batch('graph', [document('b')]), batch('vector', [document('a')])], {
            rankConstant: 60,
            weights: { vector: 1, graph: 1 }
        })

        expect(vectorFirst.map(({ metadata }) => metadata.chunkId)).toEqual(['a', 'b'])
        expect(graphFirst.map(({ metadata }) => metadata.chunkId)).toEqual(['b', 'a'])
    })

    it('ignores raw score scales and ranks only by explicit candidate rank and source weight', () => {
        const results = fusion.fuse(
            [
                batch('vector', [
                    document('first', 'first', { score: 0.000001, relevanceScore: -100 }),
                    document('second', 'second', { score: 1_000_000, relevanceScore: 1_000_000 })
                ])
            ],
            { rankConstant: 60, weights: { vector: 1 } }
        )

        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['first', 'second'])
        expect(results[0].metadata.rrfScore).toBeCloseTo(1 / 61)
        expect(results[1].metadata.rrfScore).toBeCloseTo(1 / 62)
    })

    it('uses explicit candidate ranks instead of candidate array order', () => {
        const first = document('first')
        const second = document('second')
        const rankedBatch = batch('vector', [second, first], [2, 1])

        const results = fusion.fuse([rankedBatch], {
            rankConstant: 60,
            weights: { vector: 1 }
        })

        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['first', 'second'])
        expect(results[0].metadata.rrfScore).toBeCloseTo(1 / 61)
        expect(results[1].metadata.rrfScore).toBeCloseTo(1 / 62)
    })

    it('rejects a failed batch before attempting fusion', () => {
        expect(() =>
            fusion.fuse(
                [
                    {
                        ...batch('graph', []),
                        failed: true,
                        error: 'graph backend unavailable'
                    }
                ],
                {
                    rankConstant: -1,
                    weights: {}
                }
            )
        ).toThrow(new Error('Cannot fuse failed RRF batch for source: graph: graph backend unavailable'))
    })

    it('merges overlapping document metadata with the later source taking precedence', () => {
        const results = fusion.fuse(
            [
                batch('vector', [
                    document('shared', 'vector content', {
                        score: 999,
                        sourceMarker: 'vector',
                        vectorOnly: true
                    })
                ]),
                batch('graph', [
                    document('shared', 'graph content', {
                        score: -999,
                        sourceMarker: 'graph',
                        graphOnly: true
                    })
                ])
            ],
            { rankConstant: 60, weights: { vector: 1, graph: 1 } }
        )

        expect(results).toHaveLength(1)
        expect(results[0].pageContent).toBe('graph content')
        expect(results[0].metadata).toEqual(
            expect.objectContaining({
                chunkId: 'shared',
                sourceMarker: 'graph',
                vectorOnly: true,
                graphOnly: true
            })
        )
        expect(results[0].metadata.score).toBeCloseTo(2 / 61)
        expect(results[0].metadata.relevanceScore).toBeCloseTo(2 / 61)
        expect(results[0].metadata.rrfScore).toBeCloseTo(2 / 61)
    })

    it('uses document id and then page content when chunk id is absent', () => {
        const vectorById: DocumentInterface<DocumentMetadata> & { id: string } = {
            id: 'row-1',
            pageContent: 'vector by id',
            metadata: { chunkId: '', vectorOnly: true }
        }
        const graphById: DocumentInterface<DocumentMetadata> & { id: string } = {
            id: 'row-1',
            pageContent: 'graph by id',
            metadata: { chunkId: '', graphOnly: true }
        }
        const byContent = (): DocumentInterface<DocumentMetadata> => ({
            pageContent: 'same content',
            metadata: { chunkId: '' }
        })

        const results = fusion.fuse(
            [batch('vector', [vectorById, byContent()]), batch('graph', [graphById, byContent()])],
            {
                rankConstant: 60,
                weights: { vector: 1, graph: 1 }
            }
        )

        expect(results).toHaveLength(2)
        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['row-1', 'same content'])
        expect(results[0].metadata).toEqual(expect.objectContaining({ vectorOnly: true, graphOnly: true }))
    })

    it('scores a duplicate within one source only at its best explicit rank while still merging metadata', () => {
        const results = fusion.fuse(
            [
                batch(
                    'vector',
                    [
                        document('a', 'first a', { first: true }),
                        document('a', 'later a', { later: true }),
                        document('b')
                    ],
                    [2, 1, 3]
                )
            ],
            { rankConstant: 60, weights: { vector: 1 } }
        )

        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['a', 'b'])
        expect(results[0].metadata.rrfScore).toBeCloseTo(1 / 61)
        expect(results[0].pageContent).toBe('later a')
        expect(results[0].metadata).toEqual(expect.objectContaining({ first: true, later: true }))
        expect(results[1].metadata.rrfScore).toBeCloseTo(1 / 63)
    })

    it('treats a zero source weight as disabling that source', () => {
        const results = fusion.fuse([batch('vector', [document('vector')]), batch('graph', [document('graph')])], {
            rankConstant: 60,
            weights: { vector: 1, graph: 0 }
        })

        expect(results.map(({ metadata }) => metadata.chunkId)).toEqual(['vector'])
    })

    it('does not mutate input batches, documents, or metadata', () => {
        const vectorMetadata: DocumentMetadata = {
            chunkId: 'shared',
            score: 0.9,
            nested: Object.freeze({ value: 'vector' })
        }
        const vectorDocument: DocumentInterface<DocumentMetadata> = {
            pageContent: 'vector',
            metadata: vectorMetadata
        }
        const graphDocument: DocumentInterface<DocumentMetadata> = {
            pageContent: 'graph',
            metadata: { chunkId: 'shared', score: 0.1 }
        }
        Object.freeze(vectorDocument.metadata)
        Object.freeze(vectorDocument)
        Object.freeze(graphDocument.metadata)
        Object.freeze(graphDocument)
        const vectorDocuments = [vectorDocument]
        const graphDocuments = [graphDocument]
        Object.freeze(vectorDocuments)
        Object.freeze(graphDocuments)
        const batches: KnowledgeRetrievalBatch[] = [
            {
                source: 'vector' as const,
                candidates: vectorDocuments.map((document, index) => Object.freeze({ document, rank: index + 1 })),
                diagnostics: { ...diagnostics }
            },
            {
                source: 'graph' as const,
                candidates: graphDocuments.map((document, index) => Object.freeze({ document, rank: index + 1 })),
                diagnostics: { ...diagnostics }
            }
        ]
        batches.forEach((item) => {
            Object.freeze(item.candidates)
            Object.freeze(item.diagnostics)
            Object.freeze(item)
        })
        Object.freeze(batches)

        const results = fusion.fuse(batches, {
            rankConstant: 60,
            weights: Object.freeze({ vector: 1, graph: 1 })
        })

        expect(vectorDocument).toEqual({ pageContent: 'vector', metadata: vectorMetadata })
        expect(graphDocument).toEqual({ pageContent: 'graph', metadata: { chunkId: 'shared', score: 0.1 } })
        expect(results[0]).not.toBe(vectorDocument)
        expect(results[0].metadata).not.toBe(vectorMetadata)
    })

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        'rejects invalid rankConstant %s',
        (rankConstant) => {
            expect(() =>
                fusion.fuse([batch('vector', [document('a')])], {
                    rankConstant,
                    weights: { vector: 1 }
                })
            ).toThrow(new RangeError('RRF rankConstant must be a finite non-negative number'))
        }
    )

    it('requires an explicit weight for every supplied source, including an empty source', () => {
        expect(() =>
            fusion.fuse([batch('vector', [document('a')]), batch('graph', [])], {
                rankConstant: 60,
                weights: { vector: 1 }
            })
        ).toThrow(new RangeError('Missing RRF weight for source: graph'))
    })

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        'rejects invalid source weight %s',
        (weight) => {
            expect(() =>
                fusion.fuse([batch('vector', [document('a')])], {
                    rankConstant: 60,
                    weights: { vector: weight }
                })
            ).toThrow(new RangeError('RRF weight for source "vector" must be a finite non-negative number'))
        }
    )

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        'rejects invalid candidate rank %s',
        (rank) => {
            expect(() =>
                fusion.fuse([batch('vector', [document('a')], [rank])], {
                    rankConstant: 60,
                    weights: { vector: 1 }
                })
            ).toThrow(new RangeError('RRF candidate rank for source "vector" must be a positive integer'))
        }
    )

    it('rejects duplicate batches for the same source', () => {
        expect(() =>
            fusion.fuse([batch('vector', [document('a')]), batch('vector', [document('b')])], {
                rankConstant: 60,
                weights: { vector: 1 }
            })
        ).toThrow(new Error('Duplicate RRF batch source: vector'))
    })

    it('resolves validation errors through the server-ai i18n namespace', () => {
        expect(() => fusion.fuse([], { rankConstant: -1, weights: {} })).toThrow()
        expect(() =>
            fusion.fuse([batch('vector', []), batch('vector', [])], {
                rankConstant: 60,
                weights: { vector: 1 }
            })
        ).toThrow()
        expect(() =>
            fusion.fuse([batch('graph', [])], {
                rankConstant: 60,
                weights: {}
            })
        ).toThrow()
        expect(() =>
            fusion.fuse([batch('keyword', [])], {
                rankConstant: 60,
                weights: { keyword: -1 }
            })
        ).toThrow()
        expect(() =>
            fusion.fuse([batch('vector', [document('a')], [0])], {
                rankConstant: 60,
                weights: { vector: 1 }
            })
        ).toThrow()
        expect(() =>
            fusion.fuse([{ ...batch('graph', []), failed: true }], { rankConstant: 60, weights: { graph: 1 } })
        ).toThrow()

        expect(t).toHaveBeenCalledWith('server-ai:Error.RrfRankConstantInvalid', {
            defaultValue: 'RRF rankConstant must be a finite non-negative number'
        })
        expect(t).toHaveBeenCalledWith('server-ai:Error.RrfBatchSourceDuplicate', {
            source: 'vector',
            defaultValue: 'Duplicate RRF batch source: vector'
        })
        expect(t).toHaveBeenCalledWith('server-ai:Error.RrfWeightMissing', {
            source: 'graph',
            defaultValue: 'Missing RRF weight for source: graph'
        })
        expect(t).toHaveBeenCalledWith('server-ai:Error.RrfWeightInvalid', {
            source: 'keyword',
            defaultValue: 'RRF weight for source "keyword" must be a finite non-negative number'
        })
        expect(t).toHaveBeenCalledWith('server-ai:Error.RrfCandidateRankInvalid', {
            source: 'vector',
            rank: 0,
            defaultValue: 'RRF candidate rank for source "vector" must be a positive integer'
        })
        expect(t).toHaveBeenCalledWith('server-ai:Error.RrfBatchFailed', {
            source: 'graph',
            defaultValue: 'Cannot fuse failed RRF batch for source: graph'
        })
    })
})
