import { IKnowledgebase, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { prepareKnowledgeFilter } from '../filter'
import {
    extractKeywordTerms,
    KeywordKnowledgeCandidateRetriever,
    normalizeKeywordQuery
} from './keyword-knowledge-candidate.retriever'
import { KnowledgeKeywordIndexService } from './knowledge-keyword-index.service'
import { KnowledgeRetrievalRequest } from './types'

function knowledgebase(): IKnowledgebase {
    return {
        id: 'kb-1',
        name: 'Knowledgebase',
        type: KnowledgebaseTypeEnum.Standard,
        recall: { topK: 5 },
        metadataSchema: []
    } as IKnowledgebase
}

function request(overrides: Partial<KnowledgeRetrievalRequest> = {}): KnowledgeRetrievalRequest {
    const kb = overrides.knowledgebase ?? knowledgebase()
    return {
        knowledgebase: kb,
        query: '质量要求 LSJWR4095RS105767',
        scope: { tenantId: 'tenant-1', organizationId: 'org-1' },
        modelContext: {},
        preparedFilter: prepareKnowledgeFilter({
            knowledgebase: kb,
            vectorBackend: VectorTypeEnum.PGVECTOR
        }),
        ...overrides
    }
}

type QueryMock = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function mockQuery(resolver: (sql: string, parameters?: unknown[]) => Promise<unknown[]>): QueryMock {
    return jest.fn<Promise<unknown[]>, [string, unknown[]?]>(resolver)
}

function dataSource(query: QueryMock): DataSource {
    return { options: { type: 'postgres' }, query } as unknown as DataSource
}

function keywordIndexService(ready = true) {
    return new KnowledgeKeywordIndexService(
        dataSource(
            mockQuery(async () => [
                {
                    fullTextReady: ready,
                    trigramReady: ready,
                    documentNameTrigramReady: ready
                }
            ])
        )
    )
}

function row(chunkId: string, keywordScore: number, parentChunkId?: string) {
    return {
        chunkRowId: `row-${chunkId}`,
        chunkId,
        parentChunkId,
        pageContent: `content-${chunkId}`,
        metadata: { chunkId, ...(parentChunkId ? { parentId: parentChunkId } : {}) },
        documentId: 'document-1',
        documentName: 'Requirements.pdf',
        sourceType: 'file',
        fileExtension: 'pdf',
        category: 'text',
        fileUrl: '/requirements.pdf',
        keywordScore
    }
}

describe('KeywordKnowledgeCandidateRetriever', () => {
    it('normalizes Unicode and extracts stable unique keyword terms', () => {
        expect(normalizeKeywordQuery('  ＬＳＪＷＲ4095  质量要求  ')).toBe('lsjwr4095 质量要求')
        expect(extractKeywordTerms('质量要求 LSJWR4095 lsjwr4095')).toEqual(['质量要求', 'lsjwr4095'])
    })

    it.each(['AI', '退款'])(
        'does not generate wildcard substring predicates for short query %s',
        async (shortQuery) => {
            const query = mockQuery(async () => [])
            const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

            await retriever.retrieve(request({ query: shortQuery }))

            const [sql, parameters] = query.mock.calls[0]
            expect(sql).not.toContain('ILIKE')
            expect(parameters).not.toContain(`%${shortQuery.toLowerCase()}%`)
        }
    )

    it('keeps trigram phrase and long-term matching while excluding short terms from a mixed query', async () => {
        const query = mockQuery(async () => [])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        await retriever.retrieve(request({ query: 'AI deployment' }))

        const [, parameters] = query.mock.calls[0]
        expect(parameters).toEqual(expect.arrayContaining(['%ai deployment%', '%deployment%']))
        expect(parameters).not.toContain('%ai%')
    })

    it('recalls ranked Chinese and exact identifier matches without embeddings', async () => {
        const query = mockQuery(async () => [row('identifier', 7), row('chinese', 4.5)])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request())

        expect(result.source).toBe('keyword')
        expect(result.candidates.map(({ document, rank }) => [document.metadata.chunkId, rank])).toEqual([
            ['identifier', 1],
            ['chinese', 2]
        ])
        expect(result.candidates[0].document.metadata).toEqual(
            expect.objectContaining({ keywordScore: 7, score: 7, relevanceScore: 7 })
        )
        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain("to_tsvector('simple', COALESCE(c.\"pageContent\", ''))")
        expect(sql).toContain("plainto_tsquery('simple'")
        expect(sql).toContain('c."pageContent" ILIKE')
        expect(sql).toContain('COALESCE(d."name", \'\') ILIKE')
        expect(parameters).toEqual(
            expect.arrayContaining(['质量要求 lsjwr4095rs105767', '%质量要求%', '%lsjwr4095rs105767%'])
        )
        expect(result.diagnostics).toEqual(
            expect.objectContaining({
                keywordCandidateCount: 2,
                keywordBranchHitCount: 2,
                keywordIndexStatus: 'ready',
                hitCount: 2,
                keywordLatency: expect.any(Number)
            })
        )
    })

    it('escapes wildcard characters and keeps query text out of SQL', async () => {
        const query = mockQuery(async () => [])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        await retriever.retrieve(request({ query: "100%_coverage\\manual' OR TRUE --" }))

        const [sql, parameters] = query.mock.calls[0]
        expect(sql).not.toContain("manual' OR TRUE")
        expect(parameters).toEqual(expect.arrayContaining(["%100\\%\\_coverage\\\\manual' or true --%"]))
    })

    it('enforces tenant, organization, knowledgebase, disabled and fixed-filter boundaries', async () => {
        const kb = knowledgebase()
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase: kb,
            filters: {
                fixed: {
                    kind: 'condition',
                    field: 'document.fileExtension',
                    operator: 'eq',
                    value: { kind: 'literal', value: 'pdf' }
                }
            },
            vectorBackend: VectorTypeEnum.PGVECTOR
        })
        const query = mockQuery(async () => [])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        await retriever.retrieve(request({ knowledgebase: kb, preparedFilter }))

        const [sql, parameters] = query.mock.calls[0]
        expect(sql).toContain('c."tenantId" IS NOT DISTINCT FROM $1')
        expect(sql).toContain('d."organizationId" IS NOT DISTINCT FROM $2')
        expect(sql).toContain('c."knowledgebaseId" = $3')
        expect(sql).toContain('COALESCE(d."disabled", FALSE) = FALSE')
        expect(sql).toContain("COALESCE(c.\"metadata\" ->> 'enabled', 'true') <> 'false'")
        expect(sql).toContain('d."type" = $4')
        expect(parameters?.slice(0, 4)).toEqual(['tenant-1', 'org-1', 'kb-1', 'pdf'])
    })

    it('returns the parent with only matched children and keeps the best child rank and score', async () => {
        const query = jest
            .fn<Promise<unknown[]>, [string, unknown[]?]>()
            .mockResolvedValueOnce([row('child-2', 3, 'parent-1'), row('direct', 2), row('child-1', 5, 'parent-1')])
            .mockResolvedValueOnce([
                {
                    ...row('parent-1', 0),
                    chunkRowId: 'row-parent-1',
                    pageContent: 'full parent content'
                }
            ])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request())

        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual(['parent-1', 'direct'])
        expect(result.candidates.map(({ rank }) => rank)).toEqual([1, 2])
        expect(result.candidates[0].document.metadata.keywordScore).toBe(5)
        expect(result.candidates[0].document).toEqual(
            expect.objectContaining({
                children: [
                    expect.objectContaining({ metadata: expect.objectContaining({ chunkId: 'child-2' }) }),
                    expect.objectContaining({ metadata: expect.objectContaining({ chunkId: 'child-1' }) })
                ]
            })
        )
        expect(query.mock.calls[1][0]).toContain('COALESCE(d."disabled", FALSE) = FALSE')
        expect(query.mock.calls[1][0]).toContain("COALESCE(c.\"metadata\" ->> 'enabled', 'true') <> 'false'")
        expect(query.mock.calls[1][1]).toEqual(['tenant-1', 'org-1', 'kb-1', ['parent-1']])
    })

    it('keeps a directly matched parent contribution when one of its children also matches', async () => {
        const query = jest
            .fn<Promise<unknown[]>, [string, unknown[]?]>()
            .mockResolvedValueOnce([row('parent-1', 10), row('child-1', 5, 'parent-1')])
            .mockResolvedValueOnce([
                {
                    ...row('parent-1', 0),
                    chunkRowId: 'row-parent-1',
                    pageContent: 'full parent content'
                }
            ])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request())

        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0].rank).toBe(1)
        expect(result.candidates[0].document.metadata.keywordScore).toBe(10)
        const parentDocument = result.candidates[0].document
        if (!('children' in parentDocument) || !Array.isArray(parentDocument.children)) {
            throw new Error('Expected the matched parent to include its matched children')
        }
        expect(parentDocument.children).toEqual([
            expect.objectContaining({ metadata: expect.objectContaining({ chunkId: 'child-1', keywordScore: 5 }) })
        ])
    })

    it('does not return a matched child when its parent is outside the eligible scope', async () => {
        const query = jest
            .fn<Promise<unknown[]>, [string, unknown[]?]>()
            .mockResolvedValueOnce([row('child-1', 5, 'parent-1')])
            .mockResolvedValueOnce([])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request())

        expect(result.candidates).toEqual([])
        expect(result.diagnostics.keywordBranchHitCount).toBe(0)
    })

    it('caps results at requested top K after parent-child collapse', async () => {
        const query = mockQuery(async () => [row('first', 3), row('second', 2), row('third', 1)])
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request({ k: 2 }))

        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual(['first', 'second'])
        expect(query.mock.calls[0][1]?.at(-1)).toBe(8)
    })

    it('does not query the database for an empty keyword query', async () => {
        const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>()
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request({ query: '   ' }))

        expect(query).not.toHaveBeenCalled()
        expect(result.candidates).toEqual([])
        expect(result.diagnostics).toEqual(
            expect.objectContaining({ keywordCandidateCount: 0, keywordBranchHitCount: 0, hitCount: 0 })
        )
    })

    it('returns a failed batch without scanning chunks when required indexes are missing', async () => {
        const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>()
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService(false))

        const result = await retriever.retrieve(request())

        expect(query).not.toHaveBeenCalled()
        expect(result).toEqual(
            expect.objectContaining({
                source: 'keyword',
                candidates: [],
                failed: true,
                error: expect.any(String),
                diagnostics: expect.objectContaining({
                    keywordIndexStatus: 'missing',
                    keywordCandidateCount: 0,
                    keywordBranchHitCount: 0,
                    keywordFailureReason: expect.any(String),
                    hitCount: 0
                })
            })
        )
    })

    it('returns a failed batch with diagnostics when the keyword query fails', async () => {
        const query = mockQuery(async () => {
            throw new Error('keyword database unavailable')
        })
        const retriever = new KeywordKnowledgeCandidateRetriever(dataSource(query), keywordIndexService())

        const result = await retriever.retrieve(request())

        expect(result.failed).toBe(true)
        expect(result.error).toBe('keyword database unavailable')
        expect(result.diagnostics).toEqual(
            expect.objectContaining({
                keywordIndexStatus: 'ready',
                keywordCandidateCount: 0,
                keywordBranchHitCount: 0,
                keywordFailureReason: 'keyword database unavailable',
                errors: ['keyword database unavailable'],
                hitCount: 0
            })
        )
    })

    it('rejects unsupported database engines explicitly', async () => {
        const source = {
            options: { type: 'sqlite' },
            query: jest.fn<Promise<unknown[]>, [string, unknown[]?]>()
        } as unknown as DataSource
        const retriever = new KeywordKnowledgeCandidateRetriever(source, keywordIndexService())

        await expect(retriever.retrieve(request())).rejects.toBeInstanceOf(BadRequestException)
    })
})
