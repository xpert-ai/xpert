import { KnowledgeWikiIdentityDescriptor } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult } from './entities'
import { KnowledgeWikiIdentityEmbeddingService } from './knowledge-wiki-identity-embedding.service'

function fixture() {
    const descriptor: KnowledgeWikiIdentityDescriptor = {
        kind: 'concept',
        definition: 'Retrieve by meaning.',
        domain: 'retrieval',
        scope: null
    }
    const row = Object.assign(new KnowledgeWikiSourceMapResult(), {
        id: 'new',
        canonicalName: 'Semantic search',
        identity: descriptor
    })
    const page = Object.assign(new KnowledgeWikiPage(), {
        id: 'canonical',
        canonicalName: 'Semantic retrieval',
        identityRevision: 1,
        version: 4,
        identity: { descriptor, aliases: [], embedding: null }
    })
    const embedDocuments = jest.fn(async (texts: string[]) => texts.map(() => [1, 0]))
    const store = {
        knowledgebase: { embeddingModelFingerprint: 'model-1', embeddingDimensions: 2 },
        vStore: { embeddings: { embedDocuments } }
    }
    const knowledgebaseService = { getActiveVectorStore: jest.fn(async () => store) }
    const pages = { update: jest.fn(async () => ({ affected: 1 })) }
    const results = { update: jest.fn(async () => ({ affected: 1 })) }
    const service = new KnowledgeWikiIdentityEmbeddingService(
        knowledgebaseService as unknown as KnowledgebaseService,
        pages as unknown as Repository<KnowledgeWikiPage>,
        results as unknown as Repository<KnowledgeWikiSourceMapResult>
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
        job: Object.assign(new KnowledgeWikiJob(), { knowledgebaseId: 'kb' })
    }
}

describe('Wiki identity embedding cache', () => {
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
            { id: 'canonical', identityRevision: 1 },
            expect.objectContaining({ version: expect.any(Function) })
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
            code: 'knowledge_wiki_identity_invalid'
        })
        expect(h.pages.update).not.toHaveBeenCalled()
        expect(h.results.update).not.toHaveBeenCalled()
    })
})
