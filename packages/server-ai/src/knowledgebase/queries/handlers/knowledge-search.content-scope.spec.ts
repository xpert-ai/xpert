import { DocumentInterface } from '@langchain/core/documents'
import {
    DocumentMetadata,
    IKnowledgebase,
    IKnowledgeWikiChunkMetadata,
    KnowledgeRetrievalContentScope,
    KnowledgebaseTypeEnum,
    KnowledgeRetrievalMode
} from '@xpert-ai/contracts'
import { KnowledgebaseService } from '../../knowledgebase.service'
import {
    KnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch,
    LegacyWeightedFusion,
    WeightedRrfFusion
} from '../../retrieval'
import { parseKnowledgeRetrievalContentScope } from '../../retrieval/content-scope'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeSearchQueryHandler } from './knowledge-search.handler'

const wikiMetadata: IKnowledgeWikiChunkMetadata = {
    chunkId: 'wiki-1',
    contentKind: 'wiki',
    wikiPageId: 'page-1',
    wikiPageVersionId: 'version-1',
    wikiPageKey: 'concept:test',
    wikiPageType: 'concept',
    wikiRevision: 1,
    sectionAnchor: 'root',
    projectionStatus: 'ready'
}
const original: DocumentInterface<DocumentMetadata> = {
    pageContent: 'original',
    metadata: { chunkId: 'original-1', score: 0.9 }
}
const wiki: DocumentInterface<DocumentMetadata> = { pageContent: 'wiki', metadata: { ...wikiMetadata, score: 0.8 } }

function setup(overrides: Partial<IKnowledgebase> = {}) {
    const kb = {
        id: 'kb-1',
        name: 'Test',
        type: KnowledgebaseTypeEnum.Standard,
        wikiConfig: { enabled: true },
        ...overrides
    } as IKnowledgebase
    const service = { findAll: jest.fn(async () => ({ items: [kb] })) }
    const retriever = (source: 'vector' | 'keyword' | 'graph') => ({
        source,
        retrieve: jest.fn<
            ReturnType<KnowledgeCandidateRetriever['retrieve']>,
            Parameters<KnowledgeCandidateRetriever['retrieve']>
        >(
            async (): Promise<KnowledgeRetrievalBatch> => ({
                source,
                candidates: [original, wiki].map((document, index) => ({ document, rank: index + 1 })),
                diagnostics: { filterVersion: 2, filterStatus: 'not_applied', hitCount: 2 }
            })
        )
    })
    const vector = retriever('vector')
    const keyword = retriever('keyword')
    const graph = retriever('graph')
    const handler = new KnowledgeSearchQueryHandler(
        service as unknown as KnowledgebaseService,
        vector,
        graph,
        keyword,
        new LegacyWeightedFusion(),
        new WeightedRrfFusion()
    )
    const visibility = {
        filterVisibleCandidates: jest.fn(
            async (_kb: IKnowledgebase, docs: DocumentInterface<DocumentMetadata>[]) => docs
        )
    }
    const logs = { create: jest.fn() }
    Object.defineProperty(handler, 'wikiSearchScopeService', { value: visibility, configurable: true })
    Object.defineProperty(handler, 'retrievalLogService', { value: logs })
    return { handler, vector, keyword, graph, visibility, logs }
}

function query(contentScope?: KnowledgeRetrievalContentScope, mode: KnowledgeRetrievalMode = 'vector') {
    return new KnowledgeSearchQuery({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        knowledgebases: ['kb-1'],
        query: 'requirements',
        k: 10,
        source: 'hit_testing',
        contentScope,
        retrieval: { mode }
    })
}

describe('Knowledge search content scope', () => {
    it.each([undefined, 'all'] as const)('preserves mixed results for scope %s', async (scope) => {
        const { handler, visibility } = setup()
        const result = await handler.execute(query(scope))
        expect(result.documents).toEqual([original, wiki])
        expect(visibility.filterVisibleCandidates).toHaveBeenCalledWith(expect.anything(), [original, wiki], false)
    })

    it.each(['vector', 'keyword', 'graph', 'hybrid'] as const)(
        'excludes Wiki for original scope in %s mode',
        async (mode) => {
            const { handler } = setup()
            const result = await handler.execute(query('original', mode))
            expect(result.documents.map((doc) => doc.metadata.chunkId)).toEqual(['original-1'])
        }
    )

    it.each(['vector', 'keyword', 'hybrid'] as const)(
        'only returns Wiki and preserves visibility checks in %s mode',
        async (mode) => {
            const { handler, vector, keyword, graph, visibility, logs } = setup()
            const result = await handler.execute(query('wiki', mode))
            expect(result.documents).toEqual([wiki])
            expect(graph.retrieve).not.toHaveBeenCalled()
            const selected = mode === 'keyword' ? keyword : vector
            expect(selected.retrieve).toHaveBeenCalledWith(expect.objectContaining({ contentScope: 'wiki' }))
            expect(visibility.filterVisibleCandidates).toHaveBeenCalledWith(expect.anything(), expect.anything(), false)
            expect(logs.create).toHaveBeenCalledWith(
                expect.objectContaining({ diagnostics: expect.objectContaining({ contentScope: 'wiki' }) })
            )
        }
    )

    it('omits the graph branch during Wiki-only RRF fusion', async () => {
        const { handler, graph, vector, keyword } = setup()
        const request = query('wiki', 'hybrid')
        request.input.retrieval.fusion = { mode: 'weighted_rrf', weights: { vector: 0.5, keyword: 0.3, graph: 0.2 } }
        const result = await handler.execute(request)
        expect(result.documents.map((doc) => doc.metadata.chunkId)).toEqual(['wiki-1'])
        expect(graph.retrieve).not.toHaveBeenCalled()
        expect(vector.retrieve).toHaveBeenCalledWith(expect.objectContaining({ contentScope: 'wiki' }))
        expect(keyword.retrieve).toHaveBeenCalledWith(expect.objectContaining({ contentScope: 'wiki' }))
        expect(result.diagnostics[0].graphBranchHitCount).toBe(0)
    })

    it('does not return revoked Wiki pages or fall back to original chunks', async () => {
        const { handler, visibility } = setup()
        visibility.filterVisibleCandidates.mockResolvedValue([original])
        expect((await handler.execute(query('wiki'))).documents).toEqual([])
    })

    it('excludes malformed Wiki metadata from Wiki-only results', async () => {
        const { handler, visibility } = setup()
        visibility.filterVisibleCandidates.mockResolvedValue([
            { pageContent: 'invalid', metadata: { contentKind: 'wiki', chunkId: 'invalid' } }
        ])
        expect((await handler.execute(query('wiki'))).documents).toEqual([])
    })

    it('fails closed for Wiki-only requests if visibility checking is unavailable', async () => {
        const { handler } = setup()
        Object.defineProperty(handler, 'wikiSearchScopeService', { value: undefined })
        expect((await handler.execute(query('wiki'))).documents).toEqual([])
    })

    it.each([undefined, { enabled: false, extractionGranularity: 'standard' as const }])(
        'rejects Wiki-only queries for a knowledgebase without Wiki (%s)',
        async (wikiConfig) => {
            const { handler, vector } = setup({ wikiConfig })
            await expect(handler.execute(query('wiki'))).rejects.toMatchObject({ status: 400 })
            expect(vector.retrieve).not.toHaveBeenCalled()
        }
    )

    it('rejects graph-only Wiki queries before invoking a retriever', async () => {
        const { handler, graph, vector } = setup()
        await expect(handler.execute(query('wiki', 'graph'))).rejects.toMatchObject({ status: 400 })
        expect(graph.retrieve).not.toHaveBeenCalled()
        expect(vector.retrieve).not.toHaveBeenCalled()
    })

    it('rejects Wiki-only queries with filters instead of silently returning nothing', async () => {
        const { handler, vector } = setup()
        const request = query('wiki')
        request.input.filters = {
            request: {
                kind: 'condition',
                field: 'document.fileExtension',
                operator: 'eq',
                value: { kind: 'literal', value: 'pdf' }
            }
        }
        await expect(handler.execute(request)).rejects.toMatchObject({ status: 400 })
        expect(vector.retrieve).not.toHaveBeenCalled()
    })

    it.each([null, '', 'Wiki', ['wiki'], {}, true])('rejects invalid runtime scope %s', (value) => {
        expect(() => parseKnowledgeRetrievalContentScope(value)).toThrow()
    })
})
