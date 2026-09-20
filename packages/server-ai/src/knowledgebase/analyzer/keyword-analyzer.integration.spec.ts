import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import { DocumentInterface } from '@langchain/core/documents'
import { join } from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { DocumentMetadata, IKnowledgebase, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { BUILTIN_GLOBAL_SCOPE, IKeywordAnalyzerStrategy, KeywordAnalyzerRegistry } from '@xpert-ai/plugin-sdk'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentSubscriber } from '../../knowledge-document/document.subscriber'
import { KeywordTitleSubscriber } from './keyword-title.subscriber'
import { KeywordChunkSubscriber } from './keyword-chunk.subscriber'
import { KnowledgeKeywordAnalyzerService } from './keyword-analyzer.service'
import { BasicKeywordAnalyzer } from './basic.strategy'
import { KeywordKnowledgeCandidateRetriever } from '../retrieval/keyword-knowledge-candidate.retriever'
import { KnowledgeSearchQuery } from '../queries/knowledge-search.query'
import { KnowledgeSearchQueryHandler } from '../queries/handlers/knowledge-search.handler'
import { GraphKnowledgeCandidateRetriever, LegacyWeightedFusion, WeightedRrfFusion } from '../retrieval'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeRetrievalBatch } from '../retrieval/types'
import {
    KnowledgeKeywordIndexService,
    KNOWLEDGE_KEYWORD_TITLE_INDEX,
    KNOWLEDGE_KEYWORD_VECTOR_INDEX
} from '../retrieval/knowledge-keyword-index.service'
import { prepareKnowledgeFilter } from '../filter'
import { keywordQueryPlan } from './keyword-query'
import { KnowledgeRetrievalRequest } from '../retrieval/types'
import { FAQRetrievalBudget, FAQ_RETRIEVAL_LIMITS } from '../faq/faq-retrieval-budget'
import { keywordTsQuery, keywordTsVector } from './keyword-lexemes'

const postgresDescribe = process.env.KNOWLEDGE_KEYWORD_PG_E2E === '1' ? describe : describe.skip
const schema = `keyword_analyzer_test_${process.pid}`
const jiebaPluginPath = process.env.XPERT_JIEBA_PLUGIN_PATH

postgresDescribe('Analyzer persistence and retrieval in PostgreSQL', () => {
    let db: DataSource
    let analyzers: KnowledgeKeywordAnalyzerService
    let retriever: KeywordKnowledgeCandidateRetriever
    let knowledgebase: Knowledgebase
    let titleSubscriber: KeywordTitleSubscriber
    let chunkSubscriber: KeywordChunkSubscriber
    let registry: KeywordAnalyzerRegistry
    const scope = { tenantId: 'tenant', organizationId: 'org' }

    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            schema,
            extra: { options: `-c search_path=${schema},public` },
            entities: [
                new EntitySchema<Knowledgebase>({
                    name: 'Knowledgebase',
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        id: { type: String, primary: true },
                        name: { type: String },
                        type: { type: String },
                        tenantId: { type: String },
                        organizationId: { type: String },
                        keywordAnalyzer: { type: 'jsonb', nullable: true, update: false },
                        keywordAnalyzerLocked: { type: Boolean, default: false, update: false },
                        documentNum: { type: Number, default: 0 },
                        deletedAt: { type: 'timestamp', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeDocument>({
                    name: 'KnowledgeDocument',
                    target: KnowledgeDocument,
                    tableName: 'knowledge_document',
                    columns: {
                        id: { type: String, primary: true },
                        knowledgebaseId: { type: String },
                        name: { type: String },
                        keywordTitleVector: { type: 'tsvector', nullable: true, select: false },
                        tenantId: { type: String },
                        organizationId: { type: String },
                        disabled: { type: Boolean, default: false },
                        sourceType: { type: String, nullable: true },
                        type: { type: String, nullable: true },
                        category: { type: String, nullable: true },
                        fileUrl: { type: String, nullable: true },
                        metadata: { type: 'jsonb', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeDocumentChunk>({
                    name: 'KnowledgeDocumentChunk',
                    target: KnowledgeDocumentChunk,
                    tableName: 'knowledge_document_chunk',
                    columns: {
                        id: { type: String, primary: true },
                        knowledgebaseId: { type: String },
                        documentId: { type: String },
                        tenantId: { type: String },
                        organizationId: { type: String },
                        pageContent: { type: String, nullable: true },
                        metadata: { type: 'jsonb', nullable: true },
                        keywordVector: { type: 'tsvector', nullable: true, select: false }
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        // The test schema owns its index independently of deployment scripts.
        await db.query(
            `CREATE INDEX "${KNOWLEDGE_KEYWORD_VECTOR_INDEX}"
             ON "knowledge_document_chunk" USING GIN ("keywordVector")`
        )
        await db.query(
            `CREATE INDEX "${KNOWLEDGE_KEYWORD_TITLE_INDEX}" ON "knowledge_document" USING GIN ("keywordTitleVector")`
        )
        registry = new KeywordAnalyzerRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
        registry.register('basic', new BasicKeywordAnalyzer(), { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
        registry.register(
            'whole',
            {
                meta: { id: 'whole', label: 'Whole text', languages: ['zh'], revision: 'v1' },
                analyze: async (text) => [text]
            },
            { kind: 'plugin', scopeKey: 'org', pluginName: '@test/whole' }
        )
        analyzers = new KnowledgeKeywordAnalyzerService(registry, db)
        chunkSubscriber = new KeywordChunkSubscriber(db, analyzers)
        titleSubscriber = new KeywordTitleSubscriber(db, analyzers)
        db.subscribers.push(new KnowledgeDocumentSubscriber())
        retriever = new KeywordKnowledgeCandidateRetriever(db, new KnowledgeKeywordIndexService(db))
        Object.defineProperty(retriever, 'keywordAnalyzers', { value: analyzers })
        knowledgebase = await db.getRepository(Knowledgebase).save({
            id: 'basic-kb',
            name: 'Basic',
            type: KnowledgebaseTypeEnum.Standard,
            ...scope,
            keywordAnalyzer: analyzers.forCreate(undefined)
        })
    }, 30000)

    afterAll(async () => {
        chunkSubscriber?.onModuleDestroy()
        titleSubscriber?.onModuleDestroy()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await db.destroy()
        }
    })

    async function document(kb: IKnowledgebase, id: string) {
        return db.getRepository(KnowledgeDocument).save({ id, name: id, knowledgebaseId: kb.id, ...scope })
    }

    async function search(kb: IKnowledgebase, query: string, options: Partial<KnowledgeRetrievalRequest> = {}) {
        return retriever.retrieve({
            knowledgebase: kb,
            query,
            scope,
            modelContext: {},
            preparedFilter: prepareKnowledgeFilter({ knowledgebase: kb, vectorBackend: VectorTypeEnum.PGVECTOR }),
            ...options
        })
    }

    it('locks at document insertion before chunks exist and refuses to change the analyzer', async () => {
        await document(knowledgebase, 'doc')
        const stored = await db.getRepository(Knowledgebase).findOneByOrFail({ id: knowledgebase.id })
        expect(stored.keywordAnalyzerLocked).toBe(true)
        await expect(analyzers.change(knowledgebase, null)).rejects.toThrow('cannot be changed')
        // Saving a stale entity for another setting must not revert server-owned analyzer state.
        await db.getRepository(Knowledgebase).save({ ...knowledgebase, name: 'Renamed', keywordAnalyzerLocked: false })
        expect(
            (await db.getRepository(Knowledgebase).findOneByOrFail({ id: knowledgebase.id })).keywordAnalyzerLocked
        ).toBe(true)
    })

    it('locks the analyzer before deriving a first title regardless of subscriber order', async () => {
        const kb = await db.getRepository(Knowledgebase).save({
            id: 'title-lock-kb',
            name: 'Title lock',
            type: KnowledgebaseTypeEnum.Standard,
            ...scope,
            keywordAnalyzer: knowledgebase.keywordAnalyzer
        })
        const vector = analyzers.vector.bind(analyzers)
        const analyze = jest.spyOn(analyzers, 'vector').mockImplementationOnce(async (input, name) => {
            const stored = await db.getRepository(Knowledgebase).findOneByOrFail({ id: kb.id })
            expect(stored.keywordAnalyzerLocked).toBe(true)
            return vector(input, name)
        })
        try {
            // insert uses the same connection without a surrounding save transaction.
            await db
                .getRepository(KnowledgeDocument)
                .insert({ id: 'title-lock-doc', name: 'Title', knowledgebaseId: kb.id, ...scope })
            expect(analyze).toHaveBeenCalled()
        } finally {
            analyze.mockRestore()
        }
    })

    it('indexes inserts and partial edits, recalling short Chinese words through the shared GIN field', async () => {
        await db.getRepository(KnowledgeDocumentChunk).insert({
            id: 'chunk',
            documentId: 'doc',
            knowledgebaseId: knowledgebase.id,
            ...scope,
            pageContent: '用户 可以 申请 退款'
        })
        expect((await search(knowledgebase, '退款')).candidates.map((item) => item.document.metadata.chunkId)).toEqual([
            'chunk'
        ])
        await db
            .getRepository(KnowledgeDocumentChunk)
            .update('chunk', { id: 'chunk', pageContent: '用户 可以 申请 退货' })
        expect((await search(knowledgebase, '退款')).candidates).toHaveLength(0)
        expect((await search(knowledgebase, '退货')).candidates).toHaveLength(1)
    })

    it('recalls a title-only hit once and replaces its lexemes on rename', async () => {
        await db.getRepository(KnowledgeDocument).save({
            id: 'title-doc',
            name: '退款 操作 指南',
            knowledgebaseId: knowledgebase.id,
            ...scope
        })
        for (let i = 0; i < 100; i++) {
            await db.getRepository(KnowledgeDocumentChunk).insert({
                id: `title-chunk-${i}`,
                documentId: 'title-doc',
                knowledgebaseId: knowledgebase.id,
                ...scope,
                pageContent: '在订单详情点击售后按钮提交申请。'
            })
        }
        expect((await search(knowledgebase, '退款')).candidates).toHaveLength(1)
        await db.getRepository(KnowledgeDocument).update('title-doc', { id: 'title-doc', name: '退货 操作 指南' })
        expect((await search(knowledgebase, '退款')).candidates).toHaveLength(0)
        expect(
            (await search(knowledgebase, '退货')).candidates.map((item) => item.document.metadata.documentId)
        ).toContain('title-doc')
        await db.getRepository(KnowledgeDocument).update('title-doc', { id: 'title-doc', name: '完成 指南' })
    })

    it('relaxes one ordinary term while preserving two independent matching terms', async () => {
        await document(knowledgebase, 'natural-doc')
        await db.getRepository(KnowledgeDocumentChunk).insert({
            id: 'natural-chunk',
            documentId: 'natural-doc',
            knowledgebaseId: knowledgebase.id,
            ...scope,
            pageContent: '提交订单号 即可 申请 退款'
        })
        expect(
            (await search(knowledgebase, '怎么 申请 退款')).candidates.map((item) => item.document.metadata.chunkId)
        ).toContain('natural-chunk')
        await db.getRepository(KnowledgeDocumentChunk).delete('natural-chunk')
    })

    it('shares the table and physical index across different analyzer strategies', async () => {
        const whole = analyzers.options('org').find((item) => item.analyzer.provider === 'whole')
        if (!whole) throw new Error('Missing fixture analyzer')
        const other = await db.getRepository(Knowledgebase).save({
            id: 'whole-kb',
            name: 'Whole',
            type: KnowledgebaseTypeEnum.Standard,
            ...scope,
            keywordAnalyzer: whole.analyzer
        })
        await document(other, 'whole-doc')
        await db.getRepository(KnowledgeDocumentChunk).save({
            id: 'whole-chunk',
            documentId: 'whole-doc',
            knowledgebaseId: other.id,
            ...scope,
            pageContent: '用户 可以 申请 退货',
            metadata: { chunkId: 'whole-chunk' }
        })
        expect((await search(other, '退货')).candidates).toHaveLength(0)
        expect((await search(other, '用户 可以 申请 退货')).candidates).toHaveLength(1)
        expect((await search(knowledgebase, '退货')).candidates.map((item) => item.document.metadata.chunkId)).toEqual([
            'chunk'
        ])
    })
    ;(jiebaPluginPath ? it : it.skip)(
        'retrieves short Chinese words using the independently built Jieba plugin',
        async () => {
            const { JiebaKeywordAnalyzer } = jest.requireActual<{
                JiebaKeywordAnalyzer: new () => IKeywordAnalyzerStrategy
            }>(join(jiebaPluginPath, 'dist/lib/jieba.strategy.js'))
            registry.register('jieba', new JiebaKeywordAnalyzer(), {
                kind: 'plugin',
                scopeKey: 'org',
                pluginName: '@xpert-ai/plugin-jieba'
            })
            const option = analyzers.options('org').find((item) => item.analyzer.provider === 'jieba')
            expect(option.analyzer.source.kind).toBe('plugin')
            const selected = analyzers.forCreate(option.analyzer, 'org')
            const kb = await db.getRepository(Knowledgebase).save({
                id: 'jieba-plugin-kb',
                name: 'Jieba plugin',
                type: KnowledgebaseTypeEnum.Standard,
                ...scope,
                keywordAnalyzer: selected
            })
            await document(kb, 'jieba-plugin-doc')
            await db.getRepository(KnowledgeDocumentChunk).save({
                id: 'jieba-plugin-chunk',
                documentId: 'jieba-plugin-doc',
                knowledgebaseId: kb.id,
                ...scope,
                pageContent: '用户可以申请退款'
            })
            expect((await search(kb, '退款')).candidates.map((item) => item.document.metadata.chunkId)).toEqual([
                'jieba-plugin-chunk'
            ])
            expect((await search(knowledgebase, '退款')).candidates).toHaveLength(0)
            await db
                .getRepository(KnowledgeDocument)
                .save({ id: 'jieba-title', name: '退款操作指南', knowledgebaseId: kb.id, ...scope })
            for (let i = 0; i < 100; i++)
                await db.getRepository(KnowledgeDocumentChunk).save({
                    id: `jieba-title-${i}`,
                    documentId: 'jieba-title',
                    knowledgebaseId: kb.id,
                    ...scope,
                    pageContent: '在订单详情点击售后按钮提交申请。'
                })
            const titled = await search(kb, '退款')
            expect(
                titled.candidates.filter((item) => item.document.metadata.documentId === 'jieba-title')
            ).toHaveLength(1)
            await db.getRepository(KnowledgeDocument).save({ id: 'jieba-title', name: '退货操作指南' })
            expect(
                (await search(kb, '退款')).candidates.some(
                    (item) => item.document.metadata.documentId === 'jieba-title'
                )
            ).toBe(false)
            expect((await search(kb, '退货')).candidates.map((item) => item.document.metadata.documentId)).toEqual([
                'jieba-title'
            ])
            await db
                .getRepository(KnowledgeDocumentChunk)
                .save({ id: 'jieba-plugin-chunk', pageContent: '提交订单号即可申请退款。' })
            const natural = await search(kb, '怎么申请退款')
            expect(natural.failed).not.toBe(true)
            expect(natural.candidates.map((item) => item.document.metadata.chunkId)).toContain('jieba-plugin-chunk')
            await expect(analyzers.change(kb, knowledgebase.keywordAnalyzer)).rejects.toThrow('cannot be changed')
        }
    )

    it('supports selecting an analyzer on an empty legacy knowledgebase without reindexing the table', async () => {
        const empty = await db
            .getRepository(Knowledgebase)
            .save({ id: 'empty', name: 'Empty', type: KnowledgebaseTypeEnum.Standard, ...scope })
        await analyzers.change(empty, knowledgebase.keywordAnalyzer)
        const updated = await db.getRepository(Knowledgebase).findOneByOrFail({ id: 'empty' })
        expect(updated.keywordAnalyzer).toEqual(knowledgebase.keywordAnalyzer)
        expect(updated.keywordAnalyzerLocked).toBe(false)
    })

    it('passes literal tokens safely to PostgreSQL, including query operator characters', async () => {
        const terms = ["a'b", 'x\\y', 'a|b', '退款', 'AB-123']
        const rows = await db.query<{ matched: boolean }[]>(`SELECT $1::tsvector @@ $2::tsquery AS matched`, [
            keywordTsVector(terms),
            keywordTsQuery(terms)
        ])
        expect(rows[0].matched).toBe(true)
    })

    it('rolls back analyzer selection when saving the other settings fails', async () => {
        const empty = await db
            .getRepository(Knowledgebase)
            .save({ id: 'rollback', name: 'Rollback', type: KnowledgebaseTypeEnum.Standard, ...scope })
        await expect(analyzers.saveSettings({ ...empty, name: null }, knowledgebase.keywordAnalyzer)).rejects.toThrow()
        expect((await db.getRepository(Knowledgebase).findOneByOrFail({ id: 'rollback' })).keywordAnalyzer).toBeNull()
    })

    async function fixture(id: string, content: string, title = id, metadata = {}) {
        await db
            .getRepository(KnowledgeDocument)
            .save({ id: `doc-${id}`, name: title, type: 'pdf', knowledgebaseId: knowledgebase.id, ...scope })
        await db.getRepository(KnowledgeDocumentChunk).save({
            id,
            documentId: `doc-${id}`,
            knowledgebaseId: knowledgebase.id,
            pageContent: content,
            ...scope,
            metadata: { chunkId: id, enabled: true, ...metadata }
        })
    }

    it.each(['XPERT_LOCAL_SANDBOX_ENABLED', 'PR980', 'LSJWR4095RS105767', '404', 'mixedCase', 'AB-123'])(
        'keeps identifier %s mandatory when a natural-language term is missing',
        async (identifier) => {
            const id = `identifier-${identifier}`
            await fixture(id, `${identifier} 开启`)
            await fixture(`${id}-noise`, '如何 开启')
            const result = await search(knowledgebase, `${identifier} 如何 开启`)
            expect(result.failed).not.toBe(true)
            expect(result.candidates.map((item) => item.document.metadata.chunkId)).toEqual([id])
        }
    )

    it('does not replace an exact split identifier with scattered matching words', async () => {
        await fixture('scattered-id', 'xpert unrelated local unrelated sandbox unrelated enabled 开启')
        const result = await search(knowledgebase, 'XPERT_LOCAL_SANDBOX_ENABLED 如何 开启')
        expect(result.candidates.some((item) => item.document.metadata.chunkId === 'scattered-id')).toBe(false)
    })

    it('prioritizes strict matches over repeated relaxed matches and excludes a single ordinary term', async () => {
        await fixture('strict', '怎样 支付 账单')
        await fixture('relaxed', '支付 账单 '.repeat(100))
        await fixture('single', '支付 '.repeat(1000))
        const result = await search(knowledgebase, '怎样 支付 账单')
        expect(result.candidates.map((item) => item.document.metadata.chunkId)).toEqual(['strict', 'relaxed'])
    })

    it('matches complete overlap groups using real PostgreSQL tsquery semantics', async () => {
        const plan = keywordQueryPlan(['人工', '智能', '人工智能', '技术'])
        for (const terms of [
            ['人工智能', '技术'],
            ['人工', '智能', '技术']
        ]) {
            const [result] = await db.query<{ matched: boolean }[]>('SELECT $1::tsvector @@ $2::tsquery AS matched', [
                keywordTsVector(terms),
                plan.strict
            ])
            expect(result.matched).toBe(true)
        }
        const [partial] = await db.query<{ matched: boolean }[]>('SELECT $1::tsvector @@ $2::tsquery AS matched', [
            keywordTsVector(['人工', '技术']),
            plan.strict
        ])
        expect(partial.matched).toBe(false)
    })

    it.each(['退款', 'AI', 'C', 'Go'])('preserves the analyzed short lexeme %s', async (term) => {
        const id = `short-${term}`
        await fixture(id, term)
        const result = await search(knowledgebase, term)
        expect(result.failed).not.toBe(true)
        expect(result.candidates.map((item) => item.document.metadata.chunkId)).toContain(id)
    })

    it('applies all scope and enabled predicates to title representatives before limiting them', async () => {
        const ids = [
            'allowed',
            'tenant',
            'org',
            'kb',
            'disabled',
            'chunkdisabled',
            'chunktenant',
            'chunkorg',
            'chunkkb',
            'filtered',
            'wiki'
        ]
        for (const id of ids) await fixture(`boundary-${id}`, 'unrelated body', 'scopedtitle visible')
        for (const [id, patch] of [
            ['tenant', { tenantId: 'another' }],
            ['org', { organizationId: 'another' }],
            ['kb', { knowledgebaseId: 'another' }],
            ['disabled', { disabled: true }],
            ['filtered', { type: 'md' }]
        ] as const)
            await db.getRepository(KnowledgeDocument).update(`doc-boundary-${id}`, patch)
        for (const [id, patch] of [
            ['tenant', { tenantId: 'another' }],
            ['org', { organizationId: 'another' }],
            ['kb', { knowledgebaseId: 'another' }]
        ] as const)
            await db.getRepository(KnowledgeDocumentChunk).update(`boundary-chunk${id}`, patch)
        await db
            .getRepository(KnowledgeDocumentChunk)
            .save({ id: 'boundary-chunkdisabled', metadata: { enabled: false } })
        await db.getRepository(KnowledgeDocumentChunk).save({ id: 'boundary-wiki', metadata: { contentKind: 'wiki' } })
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase,
            vectorBackend: VectorTypeEnum.PGVECTOR,
            filters: {
                fixed: {
                    kind: 'condition',
                    field: 'document.fileExtension',
                    operator: 'eq',
                    value: { kind: 'literal', value: 'pdf' }
                }
            }
        })
        const result = await search(knowledgebase, 'scopedtitle', { k: 1, contentScope: 'original', preparedFilter })
        expect(result.failed).not.toBe(true)
        expect(result.candidates.map((item) => item.document.metadata.chunkId)).toEqual(['boundary-allowed'])
        const relaxed = await search(knowledgebase, 'where scopedtitle visible', {
            k: 1,
            contentScope: 'original',
            preparedFilter
        })
        expect(relaxed.failed).not.toBe(true)
        expect(relaxed.candidates.map((item) => item.document.metadata.chunkId)).toEqual(['boundary-allowed'])
        const wiki = await search(knowledgebase, 'scopedtitle', { k: 1, contentScope: 'wiki', preparedFilter })
        expect(wiki.candidates.map((item) => item.document.metadata.chunkId)).toEqual(['boundary-wiki'])
    })

    it('applies a chunk metadata filter before choosing the title representative', async () => {
        const kb: IKnowledgebase = {
            ...knowledgebase,
            metadataSchema: [{ key: 'quality', type: 'number', scope: 'chunk' }]
        }
        await fixture('chunk-filter-a', 'first body', 'metadatatitle', { quality: 0.1 })
        await db.getRepository(KnowledgeDocumentChunk).save({
            id: 'chunk-filter-b',
            documentId: 'doc-chunk-filter-a',
            knowledgebaseId: kb.id,
            ...scope,
            pageContent: 'second body',
            metadata: { chunkId: 'chunk-filter-b', quality: 0.9 }
        })
        const preparedFilter = prepareKnowledgeFilter({
            knowledgebase: kb,
            vectorBackend: VectorTypeEnum.PGVECTOR,
            filters: {
                fixed: {
                    kind: 'condition',
                    field: 'chunk.metadata.quality',
                    operator: 'gte',
                    value: { kind: 'literal', value: 0.8 }
                }
            }
        })
        const result = await search(kb, 'metadatatitle', { preparedFilter })
        expect(result.failed).not.toBe(true)
        expect(result.candidates.map((item) => item.document.metadata.chunkId)).toEqual(['chunk-filter-b'])
    })

    it('refills bounded raw pages when many children collapse to one parent', async () => {
        await fixture('parent-refill', 'Parent context')
        for (let i = 0; i < 35; i++)
            await db.getRepository(KnowledgeDocumentChunk).save({
                id: `refill-child-${i}`,
                documentId: 'doc-parent-refill',
                knowledgebaseId: knowledgebase.id,
                ...scope,
                pageContent: 'refilltoken',
                metadata: { parentId: 'parent-refill', chunkId: `refill-child-${i}` }
            })
        for (let i = 0; i < 8; i++) await fixture(`refill-tail-${i}`, 'refilltoken extra context')
        const result = await search(knowledgebase, 'refilltoken', { k: 2 })
        expect(result.failed).not.toBe(true)
        expect(result.candidates).toHaveLength(9)
        expect(result.candidates[0].document.metadata.chunkId).toBe('parent-refill')
        expect(result.candidates.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(result.diagnostics.keywordCandidateCount).toBeGreaterThan(8)
        expect(result.diagnostics.keywordCandidateCount).toBeLessThanOrEqual(400)
    })

    it('honors the semantic FAQ candidate budget during parent refill', async () => {
        const budget = new FAQRetrievalBudget({ ...FAQ_RETRIEVAL_LIMITS, candidateSlots: 8 })
        const result = await search(knowledgebase, 'refilltoken', { k: 2, faqSession: { budget } })
        expect(result.candidates).toHaveLength(1)
        expect(result.budgetLimited).toBe(true)
        expect(result.exhausted).toBe(false)
        expect(budget.candidateSlots).toBe(8)
        expect(budget.retrievalCalls).toBe(1)
    })

    it('does not accept client-supplied derived title vectors', async () => {
        await fixture('forged', 'safe content', 'safetitle')
        await db
            .getRepository(KnowledgeDocument)
            .update('doc-forged', { disabled: false, keywordTitleVector: keywordTsVector(['forgedtoken']) })
        expect((await search(knowledgebase, 'forgedtoken')).candidates).toHaveLength(0)
        expect((await search(knowledgebase, 'safetitle')).candidates).toHaveLength(1)
    })

    it('keeps six real PostgreSQL candidates for a final Top K of five', async () => {
        for (let i = 1; i <= 6; i++) await fixture(`rank-${i}`, 'rankwindowtoken')
        const result = await search(knowledgebase, 'rankwindowtoken', { k: 5 })
        expect(result.candidates).toHaveLength(6)
        expect(result.candidates[5]).toMatchObject({ rank: 6, document: { metadata: { chunkId: 'rank-6' } } })
    })

    it('carries a real PostgreSQL rank-six candidate through Handler, RRF, and reranking', async () => {
        for (let i = 1; i <= 6; i++) await fixture(`chain-${i}`, 'chainwindowtoken')
        const kb: IKnowledgebase = {
            ...knowledgebase,
            recall: {
                topK: 5,
                fusion: { mode: 'weighted_rrf', weights: { keyword: 1, vector: 1, graph: 0 } }
            },
            rerankModelId: 'controlled-reranker'
        }
        const vectorDocument: DocumentInterface<DocumentMetadata> = {
            pageContent: 'vector overlap',
            metadata: { chunkId: 'chain-6', documentId: 'doc-chain-6' }
        }
        const vectorBatch: KnowledgeRetrievalBatch = {
            source: 'vector',
            candidates: [{ document: vectorDocument, rank: 1 }],
            diagnostics: prepareKnowledgeFilter({ knowledgebase: kb, vectorBackend: VectorTypeEnum.PGVECTOR })
                .diagnostics
        }
        const vectorRetriever = {
            source: 'vector' as const,
            retrieve: jest.fn(async () => vectorBatch)
        }
        const graphRetriever = new GraphKnowledgeCandidateRetriever({ execute: jest.fn() } as unknown as QueryBus)
        const rerankModel = {
            rerank: jest.fn(
                async (documents: DocumentInterface<DocumentMetadata>[], _query: string, options: { topN: number }) =>
                    documents
                        .map((document, index) => ({
                            index,
                            relevanceScore: document.metadata.chunkId === 'chain-6' ? 1 : 0.1
                        }))
                        .sort((left, right) => right.relevanceScore - left.relevanceScore)
                        .slice(0, options.topN)
            )
        }
        const knowledgebaseService = {
            findAll: jest.fn(async () => ({ items: [kb] })),
            getRerankModel: jest.fn(async () => rerankModel)
        }
        const handler = new KnowledgeSearchQueryHandler(
            knowledgebaseService as unknown as KnowledgebaseService,
            vectorRetriever,
            graphRetriever,
            retriever,
            new LegacyWeightedFusion(),
            new WeightedRrfFusion()
        )
        Object.defineProperty(handler, 'retrievalLogService', { value: { create: jest.fn() } })

        const result = await handler.execute(
            new KnowledgeSearchQuery({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                knowledgebases: [kb.id],
                query: 'chainwindowtoken',
                k: 5,
                retrieval: { mode: 'hybrid' },
                source: 'keyword-chain-integration'
            })
        )

        expect(rerankModel.rerank).toHaveBeenCalledTimes(1)
        expect(rerankModel.rerank.mock.calls[0][0]).toHaveLength(6)
        expect(rerankModel.rerank.mock.calls[0][0].map((document) => document.metadata.chunkId)).toContain('chain-6')
        expect(result.documents).toHaveLength(5)
        expect(result.documents[0].metadata.chunkId).toBe('chain-6')
    })

    it('boosts a matching title without multiplying its body candidates', async () => {
        await fixture('boost-a', 'boosttoken extra', 'unrelated')
        await fixture('boost-b', 'boosttoken extra', 'boosttoken')
        const result = await search(knowledgebase, 'boosttoken')
        expect(result.candidates.map((item) => item.document.metadata.chunkId)).toEqual(['boost-b', 'boost-a'])
        expect(result.candidates[0].document.metadata.keywordScore).toBeGreaterThan(
            result.candidates[1].document.metadata.keywordScore
        )
    })

    it.each(['strict', 'relaxed'])(
        'uses %s body hits as title representatives when the candidate window is full',
        async (phase) => {
            const query = `window${phase} alpha beta`
            const content = phase === 'strict' ? `${query} context` : `window${phase} alpha context`
            const expected: string[] = []
            for (let i = 0; i < 20; i++) {
                const id = `crowded-${phase}-${i}`
                await fixture(`${id}-a`, 'x', query)
                await db.getRepository(KnowledgeDocumentChunk).save({
                    id: `${id}-b`,
                    documentId: `doc-${id}-a`,
                    knowledgebaseId: knowledgebase.id,
                    ...scope,
                    pageContent: content,
                    metadata: { chunkId: `${id}-b` }
                })
                expected.push(`${id}-b`)
            }
            const result = await search(knowledgebase, query, { k: 5 })
            expect(result.failed).not.toBe(true)
            expect(result.candidates.map(({ document }) => document.metadata.chunkId).sort()).toEqual(expected.sort())
        }
    )

    it('stops at 400 raw candidates even if all children collapse into one parent', async () => {
        await fixture('cap-parent', 'parent context')
        await db.query(
            `INSERT INTO "knowledge_document_chunk" ("id", "knowledgebaseId", "documentId", "tenantId", "organizationId", "pageContent", "metadata", "keywordVector")
            SELECT 'cap-child-' || value, $1, 'doc-cap-parent', $2, $3, 'captoken',
                jsonb_build_object('chunkId', 'cap-child-' || value, 'parentId', 'cap-parent'), $4::tsvector
            FROM generate_series(1, 401) AS value`,
            [knowledgebase.id, scope.tenantId, scope.organizationId, keywordTsVector(['captoken'])]
        )
        const result = await search(knowledgebase, 'captoken', { k: 1 })
        expect(result.candidates).toHaveLength(1)
        expect(result.diagnostics.keywordCandidateCount).toBe(400)
        expect(result.budgetLimited).toBe(true)
        expect(result.exhausted).toBe(false)
    })

    it('requires the title GIN index and can use it for a real title query', async () => {
        const runner = db.createQueryRunner()
        await runner.connect()
        await runner.startTransaction()
        try {
            await runner.query('SET LOCAL enable_seqscan = off')
            const plan = await runner.query(
                'EXPLAIN (FORMAT JSON) SELECT "id" FROM "knowledge_document" WHERE "keywordTitleVector" @@ $1::tsquery',
                [await analyzers.query(knowledgebase, '退款')]
            )
            expect(JSON.stringify(plan)).toContain(KNOWLEDGE_KEYWORD_TITLE_INDEX)
        } finally {
            await runner.rollbackTransaction()
            await runner.release()
        }
        await db.query(`DROP INDEX "${KNOWLEDGE_KEYWORD_TITLE_INDEX}"`)
        try {
            const missing = await search(knowledgebase, '退款')
            expect(missing.failed).toBe(true)
            expect(missing.diagnostics.keywordIndexStatus).toBe('missing')
        } finally {
            await db.query(
                `CREATE INDEX "${KNOWLEDGE_KEYWORD_TITLE_INDEX}" ON "knowledge_document" USING GIN ("keywordTitleVector")`
            )
        }
    })

    it('can use the shared GIN index for analyzed queries', async () => {
        const runner = db.createQueryRunner()
        await runner.connect()
        await runner.startTransaction()
        try {
            await runner.query('SET LOCAL enable_seqscan = off')
            const plan = await runner.query(
                'EXPLAIN (FORMAT JSON) SELECT "id" FROM "knowledge_document_chunk" WHERE "keywordVector" @@ $1::tsquery',
                [await analyzers.query(knowledgebase, '退货')]
            )
            expect(JSON.stringify(plan)).toContain(KNOWLEDGE_KEYWORD_VECTOR_INDEX)
        } finally {
            await runner.rollbackTransaction()
            await runner.release()
        }
    })
})
