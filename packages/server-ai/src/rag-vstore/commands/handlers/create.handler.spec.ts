jest.mock('@xpert-ai/server-core', () => ({ DATABASE_POOL_TOKEN: 'pool', RequestContext: {} }))
jest.mock('../../knowledge-pg-vector.store', () => ({ KnowledgePGVectorStore: class KnowledgePGVectorStore {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ VectorStoreRegistry: class VectorStoreRegistry {} }))
jest.mock('@xpert-ai/server-config', () => ({ environment: { vectorStore: 'pgvector' } }))
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { ConfigService } from '@nestjs/config'
import { VectorTypeEnum } from '@xpert-ai/contracts'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { I18nService } from 'nestjs-i18n'
import { Pool } from 'pg'
import { RagCreateVStoreCommand } from '../create.command'
import { RagCreateVStoreHandler } from './create.handler'
import { KnowledgePGVectorStore } from '../../knowledge-pg-vector.store'

describe('RagCreateVStoreHandler backend routing', () => {
    const original = environment.vectorStore
    afterEach(() => {
        environment.vectorStore = original
    })

    it('uses per-command Milvus while the deployment uses PGVector', async () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        const createStore = jest.fn(async () => ({ backend: 'milvus' }))
        const get = jest.fn(() => ({ createStore }))
        const handler = new RagCreateVStoreHandler(
            { t: jest.fn() } as unknown as I18nService,
            {} as ConfigService,
            { get } as unknown as VectorStoreRegistry,
            {} as Pool
        )
        const embeddings: EmbeddingsInterface = { embedQuery: jest.fn(), embedDocuments: jest.fn() }
        const config = { collectionName: 'kb-milvus', vectorStore: VectorTypeEnum.MILVUS }
        await expect(handler.execute(new RagCreateVStoreCommand(embeddings, config))).resolves.toEqual({
            backend: 'milvus'
        })
        expect(get).toHaveBeenCalledWith(VectorTypeEnum.MILVUS)
        expect(createStore).toHaveBeenCalledWith(embeddings, config)
    })

    it('uses explicit PGVector and preserves the legacy default for omitted selections', async () => {
        environment.vectorStore = VectorTypeEnum.MILVUS
        const createStore = jest.fn(async () => ({ backend: 'milvus' }))
        const handler = new RagCreateVStoreHandler(
            { t: jest.fn() } as unknown as I18nService,
            {} as ConfigService,
            { get: jest.fn(() => ({ createStore })) } as unknown as VectorStoreRegistry,
            {} as Pool
        )
        const pg = Object.create(KnowledgePGVectorStore.prototype) as KnowledgePGVectorStore
        const createPg = jest.spyOn(handler, 'createPgVectorStore').mockResolvedValue(pg)
        const embeddings: EmbeddingsInterface = { embedQuery: jest.fn(), embedDocuments: jest.fn() }
        await expect(
            handler.execute(
                new RagCreateVStoreCommand(embeddings, {
                    collectionName: 'kb-pg',
                    vectorStore: VectorTypeEnum.PGVECTOR
                })
            )
        ).resolves.toBe(pg)
        expect(createPg).toHaveBeenCalledTimes(1)
        await expect(
            handler.execute(new RagCreateVStoreCommand(embeddings, { collectionName: 'legacy' }))
        ).resolves.toEqual({ backend: 'milvus' })
    })
})
