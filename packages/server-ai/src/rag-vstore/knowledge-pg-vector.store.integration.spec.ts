import { Document } from '@langchain/core/documents'
import { Pool } from 'pg'
import { KnowledgePGVectorStore } from './knowledge-pg-vector.store'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const id = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
postgresDescribe('Knowledge PGVector repeatable writes', () => {
    let pool: Pool
    let store: KnowledgePGVectorStore
    beforeAll(async () => {
        pool = new Pool({
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            user: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            max: 1
        })
        await pool.query(`CREATE TEMP TABLE wiki_vector_fixture (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text, metadata jsonb, vector vector(2), collection_id uuid)`)
        store = new KnowledgePGVectorStore(
            { embedQuery: async () => [1, 0], embedDocuments: async (texts) => texts.map(() => [1, 0]) },
            {
                pool,
                tableName: 'wiki_vector_fixture',
                columns: {
                    idColumnName: 'id',
                    contentColumnName: 'content',
                    metadataColumnName: 'metadata',
                    vectorColumnName: 'vector'
                }
            }
        )
    })
    afterAll(async () => {
        await pool?.end()
    })
    beforeEach(async () => {
        await pool.query('TRUNCATE pg_temp.wiki_vector_fixture')
    })

    it('safely repeats a partially completed indexing attempt and leaves other vectors intact', async () => {
        const document = new Document({ pageContent: 'Wiki page', metadata: { wikiPageVersionId: 'version-1' } })
        await store.addDocuments([new Document({ pageContent: 'Other page' })], { ids: [otherId] })
        await store.addDocuments([document], { ids: [id] })
        await expect(
            Promise.all([store.addDocuments([document], { ids: [id] }), store.addDocuments([document], { ids: [id] })])
        ).resolves.toBeDefined()
        expect((await pool.query('SELECT id,content FROM pg_temp.wiki_vector_fixture ORDER BY id')).rows).toEqual([
            { id, content: 'Wiki page' },
            { id: otherId, content: 'Other page' }
        ])
    })

    it('atomically replaces an existing chunk content and embedding under the same id', async () => {
        await store.addVectors([[1, 0]], [new Document({ pageContent: 'Before' })], { ids: [id] })
        await store.addVectors([[0, 1]], [new Document({ pageContent: 'After', metadata: { revision: 2 } })], {
            ids: [id]
        })
        expect(
            (await pool.query('SELECT content,vector::text,metadata FROM pg_temp.wiki_vector_fixture')).rows
        ).toEqual([{ content: 'After', vector: '[0,1]', metadata: { revision: 2 } }])
    })

    it('filters projections before Top K and reads a source by its exact physical id', async () => {
        const questionId = '00000000-0000-4000-8000-000000000003'
        await store.addVectors(
            [
                [1, 0],
                [1, 0],
                [0, 1]
            ],
            [
                new Document({
                    pageContent: 'Question',
                    metadata: { knowledgeId: 'doc', questionGenerationId: 'g', chunkId: id }
                }),
                new Document({ pageContent: 'Source A', metadata: { knowledgeId: 'doc', chunkId: id } }),
                new Document({ pageContent: 'Source B', metadata: { knowledgeId: 'doc', chunkId: otherId } })
            ],
            { ids: [questionId, id, otherId] }
        )
        const result = await store.similaritySearch('Source', 2, { knowledgeId: 'doc', sourceOnly: true })
        expect(result.map((document) => document.pageContent)).toEqual(['Source A', 'Source B'])
        expect((await store.getByIds([id])).map((document) => document.pageContent)).toEqual(['Source A'])
    })
})
