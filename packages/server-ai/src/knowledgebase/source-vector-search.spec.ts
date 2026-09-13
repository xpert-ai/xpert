import { Document } from '@langchain/core/documents'
import { VectorStore } from '@langchain/core/vectorstores'
import { KnowledgeDocumentStore } from './vector-store'
import { KnowledgePGVectorStore } from '../rag-vstore/knowledge-pg-vector.store'
import { Pool } from 'pg'
import { IDocChunkMetadata } from '@xpert-ai/contracts'

describe('source vector reads', () => {
    it.each(['pgvector', 'milvus'])('reuses one query embedding across expansion windows on %s', async (backend) => {
        const embedQuery = jest.fn(async () => [1, 0])
        const search = jest.fn(async () => ({ items: [] }))
        const vectorSearch = jest.fn(async () => [])
        const store = new KnowledgeDocumentStore({ id: 'kb', name: 'KB', type: null }, {
            embeddings: { embedQuery },
            _vectorstoreType: () => backend,
            ...(backend === 'pgvector' ? { structuredSimilaritySearchVectorWithScore: search } : {}),
            similaritySearchVectorWithScore: vectorSearch
        } as unknown as VectorStore)
        const session = store.createSearchSession('query')
        const filter =
            backend === 'pgvector'
                ? { postgres: { sql: 'TRUE', parameters: [], knowledgebaseId: 'kb' } }
                : { milvus: { expression: 'enabled == true', values: {} } }
        await session.structuredSimilaritySearchWithScore('query', 2, filter)
        await session.structuredSimilaritySearchWithScore('query', 4, filter)
        expect(embedQuery).toHaveBeenCalledTimes(1)
        await store.createSearchSession('another query').structuredSimilaritySearchWithScore('another query', 2, filter)
        expect(embedQuery).toHaveBeenCalledTimes(2)
    })

    it('filters question projections before the Milvus search and looks up the exact source primary key', async () => {
        const similaritySearch = jest.fn(async () => [])
        const store = new KnowledgeDocumentStore({ id: 'kb', name: 'KB', type: null }, {
            _vectorstoreType: () => 'milvus',
            primaryField: 'id',
            filterString: () => 'knowledgeId == "doc"',
            similaritySearch
        } as unknown as VectorStore)
        await store.getChunks('doc', { search: 'test', take: 1 })
        expect(similaritySearch).toHaveBeenCalledWith(
            'test',
            expect.any(Number),
            '(knowledgeId == "doc") and not (exists filterAttributes["chunkMetadata"]["questionGenerationId"])'
        )
        await store.getChunk('source-id')
        expect(similaritySearch).toHaveBeenLastCalledWith('*', 1, 'id == "source-id"')
    })

    it('restricts Milvus management to canonical ids even after source metadata is copied onto projections', async () => {
        const similaritySearch = jest.fn(async () => [])
        const store = new KnowledgeDocumentStore({ id: 'kb', name: 'KB', type: null }, {
            _vectorstoreType: () => 'milvus',
            primaryField: 'id',
            filterString: () => 'knowledgeId == "doc"',
            similaritySearch
        } as unknown as VectorStore)
        await store.getChunks('doc', { search: 'test', take: 1, sourceChunkIds: ['source-id'] })
        expect(similaritySearch).toHaveBeenCalledWith(
            'test',
            expect.any(Number),
            '(knowledgeId == "doc") and id in ["source-id"]'
        )
    })

    it('reads a single source by its collection-scoped physical id without embedding a wildcard', async () => {
        const source = new Document({ pageContent: 'Source', metadata: { chunkId: 'logical' } })
        const getByIds = jest.fn(async () => [source])
        const similaritySearch = jest.fn()
        const store = new KnowledgeDocumentStore({ id: 'kb', name: 'KB', type: null }, {
            getByIds,
            similaritySearch
        } as unknown as VectorStore)
        expect(await store.getChunk('source-id')).toEqual(source)
        expect(getByIds).toHaveBeenCalledWith(['source-id'])
        expect(similaritySearch).not.toHaveBeenCalled()
    })

    it('excludes question projections before applying the source search limit', async () => {
        const vectors = Array.from({ length: 3000 }, (_, index) => [
            new Document<IDocChunkMetadata>({ pageContent: `Source ${index}`, metadata: { chunkId: `s${index}` } }),
            ...Array.from(
                { length: 3 },
                () =>
                    new Document<IDocChunkMetadata>({
                        pageContent: 'Question',
                        metadata: { chunkId: `s${index}`, questionGenerationId: 'g' }
                    })
            )
        ]).flat()
        const search = jest.fn(async (_query: string, k: number, filter: { sourceOnly?: boolean }) =>
            vectors.filter((doc) => !filter.sourceOnly || !doc.metadata.questionGenerationId).slice(0, k)
        )
        const store = new KnowledgeDocumentStore({ id: 'kb', name: 'KB', type: null }, {
            similaritySearch: search,
            _vectorstoreType: () => 'pgvector'
        } as unknown as VectorStore)
        const page = await store.getChunks('doc', { search: 'Source', skip: 2500, take: 100 })
        expect(page.total).toBe(3000)
        expect(page.items).toHaveLength(100)
    })

    it('adds a parameterized source predicate to PGVector searches and keeps collection scope', async () => {
        const query = jest.fn(async (_sql: string, _parameters?: unknown[]) => ({ rows: [] }))
        const embeddings = { embedQuery: jest.fn(async () => [1, 0]), embedDocuments: jest.fn(async () => []) }
        const store = new KnowledgePGVectorStore(embeddings, {
            pool: { query } as unknown as Pool,
            tableName: 'vectors',
            collectionTableName: 'collections'
        })
        jest.spyOn(store, 'getOrCreateCollection').mockResolvedValue('collection')
        await store.similaritySearch('Source', 20, { knowledgeId: 'doc', sourceOnly: true })
        expect(query.mock.calls[0][0]).toContain('questionGenerationId')
        expect(query.mock.calls[0][0]).not.toContain("->>'sourceOnly'")
        expect(query.mock.calls[0][0]).toContain('"collection_id" = $3')
        expect(query.mock.calls[0][1]).toEqual(['[1,0]', 20, 'collection', 'knowledgeId', 'doc'])
        query.mockClear()
        await store.getByIds(['00000000-0000-4000-8000-000000000001'])
        expect(query).toHaveBeenCalledWith(expect.stringContaining('AND "collection_id" = $2'), [
            ['00000000-0000-4000-8000-000000000001'],
            'collection'
        ])
        expect(embeddings.embedQuery).toHaveBeenCalledTimes(1)
    })
})
