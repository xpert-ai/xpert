import { IKnowledgebase, KnowledgeFilterSources, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { DataSource, QueryRunner } from 'typeorm'
import { prepareKnowledgeFilter } from '../filter'
import { KeywordKnowledgeCandidateRetriever } from './keyword-knowledge-candidate.retriever'
import {
    KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX,
    KNOWLEDGE_KEYWORD_FTS_INDEX,
    KNOWLEDGE_KEYWORD_TRIGRAM_INDEX,
    KnowledgeKeywordIndexService
} from './knowledge-keyword-index.service'
import { KnowledgeRetrievalRequest } from './types'

const runPostgresIntegration = process.env.KNOWLEDGE_KEYWORD_PG_E2E === '1'
const postgresDescribe = runPostgresIntegration ? describe : describe.skip
const schemaName = `knowledge_keyword_test_${process.pid}`

const tenantId = 'tenant-1'
const organizationId = 'org-1'
const knowledgebaseId = 'kb-1'

type DocumentFixture = {
    id: string
    name: string
    type?: string
    tenantId?: string
    organizationId?: string
    knowledgebaseId?: string
    disabled?: boolean
}

type ChunkFixture = {
    id: string
    documentId: string
    pageContent: string
    metadata?: Record<string, unknown>
    tenantId?: string
    organizationId?: string
    knowledgebaseId?: string
}

postgresDescribe('KeywordKnowledgeCandidateRetriever PostgreSQL integration', () => {
    let dataSource: DataSource
    let queryRunner: QueryRunner
    let scopedDataSource: DataSource
    let retriever: KeywordKnowledgeCandidateRetriever
    let keywordIndexService: KnowledgeKeywordIndexService
    let lastCandidateQuery: { sql: string; parameters?: unknown[] } | undefined

    const knowledgebase: IKnowledgebase = {
        id: knowledgebaseId,
        name: 'Keyword integration knowledgebase',
        type: KnowledgebaseTypeEnum.Standard,
        recall: { topK: 10 },
        metadataSchema: []
    } as IKnowledgebase

    function request(
        query: string,
        options?: { k?: number; filters?: KnowledgeFilterSources }
    ): KnowledgeRetrievalRequest {
        return {
            knowledgebase,
            query,
            k: options?.k,
            scope: { tenantId, organizationId },
            modelContext: {},
            preparedFilter: prepareKnowledgeFilter({
                knowledgebase,
                filters: options?.filters,
                vectorBackend: VectorTypeEnum.PGVECTOR
            })
        }
    }

    async function insertDocument(fixture: DocumentFixture) {
        await queryRunner.query(
            `INSERT INTO "knowledge_document" (
                "id", "tenantId", "organizationId", "knowledgebaseId", "disabled",
                "name", "sourceType", "type", "category", "fileUrl", "metadata"
             ) VALUES ($1, $2, $3, $4, $5, $6, 'file', $7, 'text', $8, '{}'::jsonb)`,
            [
                fixture.id,
                fixture.tenantId ?? tenantId,
                fixture.organizationId ?? organizationId,
                fixture.knowledgebaseId ?? knowledgebaseId,
                fixture.disabled ?? false,
                fixture.name,
                fixture.type ?? 'pdf',
                `/${fixture.id}.${fixture.type ?? 'pdf'}`
            ]
        )
    }

    async function insertChunk(fixture: ChunkFixture) {
        await queryRunner.query(
            `INSERT INTO "knowledge_document_chunk" (
                "id", "tenantId", "organizationId", "knowledgebaseId", "documentId", "pageContent", "metadata"
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
                fixture.id,
                fixture.tenantId ?? tenantId,
                fixture.organizationId ?? organizationId,
                fixture.knowledgebaseId ?? knowledgebaseId,
                fixture.documentId,
                fixture.pageContent,
                JSON.stringify({ chunkId: fixture.id, enabled: true, ...fixture.metadata })
            ]
        )
    }

    beforeAll(async () => {
        dataSource = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap'
        })
        await dataSource.initialize()
        queryRunner = dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`)
        await queryRunner.query(`SET search_path TO "${schemaName}", public`)
        await queryRunner.query(`
            CREATE TABLE "knowledge_document" (
                "id" varchar PRIMARY KEY,
                "tenantId" varchar,
                "organizationId" varchar,
                "knowledgebaseId" varchar NOT NULL,
                "disabled" boolean NOT NULL DEFAULT false,
                "name" varchar,
                "sourceType" varchar,
                "type" varchar,
                "category" varchar,
                "fileUrl" varchar,
                "metadata" jsonb
            );
            CREATE TABLE "knowledge_document_chunk" (
                "id" varchar PRIMARY KEY,
                "tenantId" varchar,
                "organizationId" varchar,
                "knowledgebaseId" varchar NOT NULL,
                "documentId" varchar NOT NULL REFERENCES "knowledge_document"("id"),
                "pageContent" text,
                "metadata" jsonb
            );
        `)

        scopedDataSource = {
            options: { type: 'postgres' },
            query: <T = unknown>(sql: string, parameters?: unknown[]) => {
                if (sql.includes('FROM "knowledge_document_chunk" c')) {
                    lastCandidateQuery = { sql, parameters }
                }
                return queryRunner.query(sql, parameters) as Promise<T>
            }
        } as unknown as DataSource
        keywordIndexService = new KnowledgeKeywordIndexService(scopedDataSource)
        retriever = new KeywordKnowledgeCandidateRetriever(scopedDataSource, keywordIndexService)

        const documents: DocumentFixture[] = [
            { id: 'doc-faq', name: '退款 FAQ' },
            { id: 'doc-wiki-title', name: '部署 Wiki 指南', type: 'md' },
            { id: 'doc-wiki-body', name: '运行手册', type: 'md' },
            { id: 'doc-chinese', name: '成熟度资料' },
            { id: 'doc-identifier', name: '车辆信号' },
            { id: 'doc-short', name: 'AI 术语' },
            { id: 'doc-boundary-enabled', name: '边界内文档' },
            { id: 'doc-boundary-disabled', name: '禁用文档', disabled: true },
            { id: 'doc-boundary-chunk-disabled', name: '含禁用分块的文档' },
            { id: 'doc-other-tenant', name: '其他租户', tenantId: 'tenant-2' },
            { id: 'doc-other-organization', name: '其他组织', organizationId: 'org-2' },
            { id: 'doc-other-kb', name: '其他知识库', knowledgebaseId: 'kb-2' },
            { id: 'doc-filter-pdf', name: 'PDF 过滤', type: 'pdf' },
            { id: 'doc-filter-md', name: 'Markdown 过滤', type: 'md' },
            { id: 'doc-parent', name: '父子分块' },
            { id: 'doc-title-many', name: '批量标题关键字', type: 'md' },
            { id: 'doc-large-fixture', name: '大知识库执行计划样本' }
        ]
        for (const document of documents) await insertDocument(document)

        const chunks: ChunkFixture[] = [
            { id: 'faq-content', documentId: 'doc-faq', pageContent: '退款条件是什么？购买后七天内可以申请退款。' },
            { id: 'wiki-title', documentId: 'doc-wiki-title', pageContent: '这是知识库目录页。' },
            { id: 'wiki-body', documentId: 'doc-wiki-body', pageContent: '生产环境部署步骤包括准备数据库和配置服务。' },
            { id: 'chinese-exact', documentId: 'doc-chinese', pageContent: '智能制造能力成熟度模型' },
            { id: 'identifier-exact', documentId: 'doc-identifier', pageContent: 'LSJWR4095RS105767' },
            { id: 'short-ai', documentId: 'doc-short', pageContent: 'AI 辅助检索能够召回专业缩写。' },
            { id: 'boundary-enabled', documentId: 'doc-boundary-enabled', pageContent: 'boundarytoken' },
            { id: 'boundary-disabled-document', documentId: 'doc-boundary-disabled', pageContent: 'boundarytoken' },
            {
                id: 'boundary-disabled-chunk',
                documentId: 'doc-boundary-chunk-disabled',
                pageContent: 'boundarytoken',
                metadata: { enabled: false }
            },
            {
                id: 'boundary-other-tenant',
                documentId: 'doc-other-tenant',
                pageContent: 'boundarytoken',
                tenantId: 'tenant-2'
            },
            {
                id: 'boundary-other-organization',
                documentId: 'doc-other-organization',
                pageContent: 'boundarytoken',
                organizationId: 'org-2'
            },
            {
                id: 'boundary-other-kb',
                documentId: 'doc-other-kb',
                pageContent: 'boundarytoken',
                knowledgebaseId: 'kb-2'
            },
            { id: 'filter-pdf', documentId: 'doc-filter-pdf', pageContent: 'filtertoken' },
            { id: 'filter-md', documentId: 'doc-filter-md', pageContent: 'filtertoken' },
            { id: 'parent-1', documentId: 'doc-parent', pageContent: '完整的专项验收章节。' },
            {
                id: 'child-1',
                documentId: 'doc-parent',
                pageContent: '专项验收要求包括签字盖章。',
                metadata: { parentId: 'parent-1' }
            },
            ...Array.from({ length: 6 }, (_, index) => ({
                id: `title-many-${index + 1}`,
                documentId: 'doc-title-many',
                pageContent: `第 ${index + 1} 个正文分块。`
            }))
        ]
        for (const chunk of chunks) await insertChunk(chunk)
        await queryRunner.query(
            `INSERT INTO "knowledge_document_chunk" (
                "id", "tenantId", "organizationId", "knowledgebaseId", "documentId", "pageContent", "metadata"
             )
             SELECT
                'large-fixture-' || value,
                $1,
                $2,
                $3,
                'doc-large-fixture',
                'ordinary filler content number ' || value,
                jsonb_build_object('chunkId', 'large-fixture-' || value, 'enabled', true)
             FROM generate_series(1, 10000) AS value`,
            [tenantId, organizationId, knowledgebaseId]
        )

        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "${KNOWLEDGE_KEYWORD_FTS_INDEX}"
             ON "knowledge_document_chunk" USING gin (to_tsvector('simple', COALESCE("pageContent", '')))`
        )
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "${KNOWLEDGE_KEYWORD_TRIGRAM_INDEX}"
             ON "knowledge_document_chunk" USING gin ("pageContent" gin_trgm_ops)`
        )
        await queryRunner.query(
            `CREATE INDEX CONCURRENTLY "${KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX}"
             ON "knowledge_document" USING gin ("name" gin_trgm_ops)`
        )
    }, 30000)

    afterAll(async () => {
        if (queryRunner?.isReleased === false) {
            await queryRunner.query('SET search_path TO public')
            await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
            await queryRunner.release()
        }
        if (dataSource?.isInitialized) await dataSource.destroy()
    })

    it('creates and recognizes the real PostgreSQL full-text and trigram indexes', async () => {
        await expect(keywordIndexService.status()).resolves.toEqual({
            fullTextReady: true,
            trigramReady: true,
            documentNameTrigramReady: true,
            ready: true
        })
        const indexes = await scopedDataSource.query<Array<{ indexname: string; indexdef: string }>>(
            `SELECT indexname, indexdef
             FROM pg_indexes
             WHERE schemaname = $1
               AND indexname = ANY($2::text[])
             ORDER BY indexname`,
            [
                schemaName,
                [KNOWLEDGE_KEYWORD_FTS_INDEX, KNOWLEDGE_KEYWORD_TRIGRAM_INDEX, KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX]
            ]
        )

        expect(indexes).toHaveLength(3)
        expect(indexes.map(({ indexname }) => indexname)).toEqual(
            [KNOWLEDGE_KEYWORD_FTS_INDEX, KNOWLEDGE_KEYWORD_TRIGRAM_INDEX, KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX].sort()
        )
        expect(indexes.map(({ indexdef }) => indexdef).join('\n')).toContain("to_tsvector('simple'::regconfig")
        expect(indexes.map(({ indexdef }) => indexdef).join('\n')).toContain('gin_trgm_ops')
    })

    it.each([
        ['FAQ body', '退款条件', 'faq-content'],
        ['Wiki title', '部署 Wiki', 'wiki-title'],
        ['Wiki body', '生产环境部署步骤', 'wiki-body'],
        ['Chinese exact text', '智能制造能力成熟度模型', 'chinese-exact'],
        ['exact identifier', 'LSJWR4095RS105767', 'identifier-exact'],
        ['two-character Latin abbreviation', 'AI', 'short-ai']
    ])('recalls %s using real PostgreSQL ranking', async (_caseName, query, expectedChunkId) => {
        const result = await retriever.retrieve(request(query))

        expect(result.failed).not.toBe(true)
        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toContain(expectedChunkId)
        expect(result.candidates.every(({ rank }, index) => rank === index + 1)).toBe(true)
    })

    it('does not run substring recall for a standalone two-character Chinese query', async () => {
        const result = await retriever.retrieve(request('退款'))

        expect(result.candidates).toEqual([])
    })

    it.each(['AI', '退款'])('uses the full-text index for short query %s in a large knowledgebase', async (query) => {
        lastCandidateQuery = undefined
        await retriever.retrieve(request(query))
        if (!lastCandidateQuery) throw new Error('Expected the keyword candidate query to execute')

        const plan = await queryRunner.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lastCandidateQuery.sql}`, [
            ...(lastCandidateQuery.parameters ?? [])
        ])

        expect(lastCandidateQuery.sql).not.toContain('ILIKE')
        expect(JSON.stringify(plan)).toContain(KNOWLEDGE_KEYWORD_FTS_INDEX)
    })

    it('enforces tenant, organization, knowledgebase, document and chunk enabled boundaries', async () => {
        const result = await retriever.retrieve(request('boundarytoken'))

        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual(['boundary-enabled'])
    })

    it('applies Knowledge Filter V2 conditions in the real keyword SQL', async () => {
        const result = await retriever.retrieve(
            request('filtertoken', {
                filters: {
                    fixed: {
                        kind: 'condition',
                        field: 'document.fileExtension',
                        operator: 'eq',
                        value: { kind: 'literal', value: 'pdf' }
                    }
                }
            })
        )

        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual(['filter-pdf'])
    })

    it('returns the eligible parent with the matched child from real rows', async () => {
        const result = await retriever.retrieve(request('签字盖章'))

        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toEqual(
            expect.objectContaining({
                rank: 1,
                document: expect.objectContaining({
                    metadata: expect.objectContaining({ chunkId: 'parent-1' }),
                    children: [expect.objectContaining({ metadata: expect.objectContaining({ chunkId: 'child-1' }) })]
                })
            })
        )
    })

    it('caps a document-title match that fans out to many chunks at top K', async () => {
        const result = await retriever.retrieve(request('批量标题关键字', { k: 3 }))

        expect(result.diagnostics.keywordCandidateCount).toBe(6)
        expect(result.candidates).toHaveLength(3)
        expect(result.candidates.map(({ document }) => document.metadata.chunkId)).toEqual([
            'title-many-1',
            'title-many-2',
            'title-many-3'
        ])
    })
})
