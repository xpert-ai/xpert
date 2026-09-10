import { KnowledgeIdentityDescriptor } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeIdentity } from './knowledge-identity.entity'
import { KnowledgeIdentityInput, KnowledgeIdentityCatalogueEntry } from './knowledge-identity.types'
import { KnowledgeIdentityEmbeddingService } from './knowledge-identity-embedding.service'

function fixture() {
    const descriptor: KnowledgeIdentityDescriptor = {
        kind: 'concept',
        definition: 'Retrieve by meaning.',
        domain: 'retrieval',
        scope: null
    }
    const row: KnowledgeIdentityInput = {
        candidateKey: 'candidate',
        canonicalName: 'Semantic search',
        descriptor,
        aliases: [],
        facts: []
    }
    const page: KnowledgeIdentityCatalogueEntry = {
        id: 'canonical',
        canonicalName: 'Semantic retrieval',
        revision: 1,
        profile: { descriptor, aliases: [], embedding: null }
    }
    const embedDocuments = jest.fn(async (texts: string[]) => texts.map(() => [1, 0]))
    const store = {
        knowledgebase: { embeddingModelFingerprint: 'model-1', embeddingDimensions: 2 },
        vStore: { embeddings: { embedDocuments } }
    }
    const knowledgebaseService = { getActiveVectorStore: jest.fn(async () => store) }
    const pages = { update: jest.fn(async () => ({ affected: 1 })) }
    const results = { update: jest.fn(async () => ({ affected: 1 })) }
    const service = new KnowledgeIdentityEmbeddingService(
        knowledgebaseService as unknown as KnowledgebaseService,
        pages as unknown as Repository<KnowledgeIdentity>
    )
    return {
        service,
        row,
        page,
        store,
        embedDocuments,
        pages,
        results,
        knowledgebaseService,
        job: 'kb'
    }
}

describe('Shared identity embedding cache', () => {
    it('reuses vectors for unchanged identity text and model, without using the reranker', async () => {
        const h = fixture()
        await h.service.prepare(h.job, h.row, [h.page])
        await h.service.prepare(h.job, h.row, [h.page])
        expect(h.embedDocuments).toHaveBeenCalledTimes(1)
        expect(h.embedDocuments.mock.calls[0][0]).toHaveLength(2)
        expect(h.knowledgebaseService.getActiveVectorStore).toHaveBeenCalledWith('kb', true, undefined, {
            rerankEnabled: false
        })
        expect(h.pages.update).toHaveBeenCalledWith(
            { id: 'canonical', revision: 1 },
            expect.objectContaining({ embedding: expect.objectContaining({ vector: [1, 0] }) })
        )
    })

    it('refreshes vectors when the embedding model or identifying text changes', async () => {
        const h = fixture()
        await h.service.prepare(h.job, h.row, [h.page])
        h.store.knowledgebase.embeddingModelFingerprint = 'model-2'
        await h.service.prepare(h.job, h.row, [h.page])
        h.row.canonicalName = 'Updated name'
        await h.service.prepare(h.job, h.row, [h.page])
        expect(h.embedDocuments.mock.calls.map(([texts]) => texts.length)).toEqual([2, 2, 1])
    })

    it.each([
        { vectors: [[1, 0], [1]] },
        {
            vectors: [
                [0, 0],
                [1, 0]
            ]
        },
        {
            vectors: [
                [1, Number.NaN],
                [1, 0]
            ]
        }
    ])('rejects unusable vectors before caching them', async ({ vectors }) => {
        const h = fixture()
        h.embedDocuments.mockResolvedValue(vectors)
        await expect(h.service.prepare(h.job, h.row, [h.page])).rejects.toMatchObject({
            code: 'invalid'
        })
        expect(h.pages.update).not.toHaveBeenCalled()
        expect(h.results.update).not.toHaveBeenCalled()
    })
})
