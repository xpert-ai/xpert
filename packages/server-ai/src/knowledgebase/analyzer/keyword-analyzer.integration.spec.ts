import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { join } from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { IKnowledgebase, KnowledgebaseTypeEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { BUILTIN_GLOBAL_SCOPE, IKeywordAnalyzerStrategy, KeywordAnalyzerRegistry } from '@xpert-ai/plugin-sdk'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentSubscriber } from '../../knowledge-document/document.subscriber'
import { KeywordChunkSubscriber } from './keyword-chunk.subscriber'
import { KnowledgeKeywordAnalyzerService } from './keyword-analyzer.service'
import { BasicKeywordAnalyzer } from './basic.strategy'
import { KeywordKnowledgeCandidateRetriever } from '../retrieval/keyword-knowledge-candidate.retriever'
import {
    KnowledgeKeywordIndexService,
    KNOWLEDGE_KEYWORD_VECTOR_INDEX
} from '../retrieval/knowledge-keyword-index.service'
import { prepareKnowledgeFilter } from '../filter'
import { keywordTsQuery, keywordTsVector } from './keyword-lexemes'

const postgresDescribe = process.env.KNOWLEDGE_KEYWORD_PG_E2E === '1' ? describe : describe.skip
const schema = `keyword_analyzer_test_${process.pid}`
const jiebaPluginPath = process.env.XPERT_JIEBA_PLUGIN_PATH

postgresDescribe('Analyzer persistence and retrieval in PostgreSQL', () => {
    let db: DataSource
    let analyzers: KnowledgeKeywordAnalyzerService
    let retriever: KeywordKnowledgeCandidateRetriever
    let knowledgebase: Knowledgebase
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
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await db.destroy()
        }
    })

    async function document(kb: IKnowledgebase, id: string) {
        return db.getRepository(KnowledgeDocument).save({ id, name: id, knowledgebaseId: kb.id, ...scope })
    }

    async function search(kb: IKnowledgebase, query: string) {
        return retriever.retrieve({
            knowledgebase: kb,
            query,
            scope,
            modelContext: {},
            preparedFilter: prepareKnowledgeFilter({ knowledgebase: kb, vectorBackend: VectorTypeEnum.PGVECTOR })
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
