import type { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import type { Cache } from 'cache-manager'
import type { KnowledgebaseService } from '../knowledgebase.service'
import type { KnowledgeDocumentStore } from '../vector-store'
import { prepareKnowledgeFilter } from '../filter'
import type { KnowledgeRetrievalRequest } from '../retrieval/types'
import { FAQSemanticCacheService } from './faq-semantic-cache.service'
import { FAQRetrievalBudget, FAQ_RETRIEVAL_LIMITS } from './faq-retrieval-budget'
import { FAQSemanticService } from './faq-semantic.service'

jest.mock('../knowledgebase.service', () => ({ KnowledgebaseService: class KnowledgebaseService {} }))

function faq(id = 'a', negative = 'negative'): DocumentInterface<DocumentMetadata> {
    return {
        pageContent: 'answer',
        metadata: {
            contentKind: 'faq',
            chunkId: id,
            standardQuestion: 'positive',
            similarQuestions: [],
            negativeQuestions: negative ? [negative] : [],
            answerBlocks: ['answer'],
            enabled: true,
            faqVectorIds: [],
            vectorSyncStatus: 'ready'
        }
    }
}

function fixture() {
    const kb = {
        id: 'kb',
        tenantId: 'tenant',
        organizationId: 'org',
        type: KnowledgebaseTypeEnum.FAQ,
        embeddingModelFingerprint: 'model-1',
        embeddingDimensions: 2,
        faqConfig: {
            indexMode: 'question_only',
            questionIndexMode: 'separate',
            negativeMatchMode: 'semantic',
            semanticThreshold: 0.85,
            semanticMargin: 0.05
        }
    } as IKnowledgebase
    const query = jest.fn(async () => [1, 0])
    const scoreVector = (score: number) => [score, Math.sqrt(1 - score * score)]
    const embed = jest.fn(async (texts: string[]) =>
        texts.map((text) => scoreVector(text === 'positive' ? 0.72 : text === 'negative' ? 0.91 : 0.73))
    )
    let queryPromise: Promise<number[]>
    const store = {
        knowledgebase: kb,
        embeddingModel: 'model',
        vStore: { embeddings: { embedDocuments: embed } },
        createSearchSession: () => ({ getQueryEmbedding: () => (queryPromise ??= query()) })
    } as unknown as KnowledgeDocumentStore
    const backend = { getActiveVectorStore: jest.fn(async () => store) }
    const cache = { get: jest.fn(async () => undefined), set: jest.fn(async () => undefined) }
    const service = new FAQSemanticService(
        backend as unknown as KnowledgebaseService,
        new FAQSemanticCacheService(cache as unknown as Cache)
    )
    const request: KnowledgeRetrievalRequest = {
        knowledgebase: kb,
        query: 'query',
        scope: { tenantId: 'tenant', organizationId: 'org' },
        modelContext: { xpertId: 'xpert', threadId: 'thread' },
        preparedFilter: prepareKnowledgeFilter({ knowledgebase: kb }),
        faqSession: { budget: new FAQRetrievalBudget() }
    }
    return { service, backend, cache, request, embed, query }
}

describe('FAQ semantic request session', () => {
    it('does not call embeddings for exact positives, exact negatives or FAQs without negatives', async () => {
        const f = fixture()
        f.request.query = 'positive'
        expect(await f.service.createSession(f.request).filter([faq()])).toHaveLength(1)
        f.request.query = 'negative'
        expect(await f.service.createSession(f.request).filter([faq()])).toHaveLength(0)
        f.request.query = 'other'
        expect(await f.service.createSession(f.request).filter([faq('a', '')])).toHaveLength(1)
        expect(f.backend.getActiveVectorStore).not.toHaveBeenCalled()
    })

    it('excludes high-confidence negatives, memoizes a repeated FAQ, and reevaluates changed content', async () => {
        const f = fixture()
        const session = f.service.createSession(f.request)
        expect(await session.filter([faq()])).toHaveLength(0)
        expect(await session.filter([faq()])).toHaveLength(0)
        expect(session.diagnostics.compared).toBe(1)
        expect(session.diagnostics.reused).toBe(1)
        expect(await session.filter([faq('a', 'ambiguous')])).toHaveLength(1)
        expect(session.diagnostics.compared).toBe(2)
        expect(f.query).toHaveBeenCalledTimes(1)
        expect(f.embed.mock.calls[1][0]).toEqual(['ambiguous'])
        expect(f.backend.getActiveVectorStore).toHaveBeenCalledWith(
            'kb',
            true,
            { xpertId: 'xpert', threadId: 'thread' },
            { rerankEnabled: false }
        )
    })

    it('retains valid vectors within the request even if the shared cache cannot write', async () => {
        const f = fixture()
        f.cache.set.mockRejectedValue(new Error('cache down'))
        const session = f.service.createSession(f.request)
        await session.filter([faq('a')])
        await session.filter([faq('b')])
        expect(f.embed).toHaveBeenCalledTimes(1)
        expect(session.diagnostics.cacheErrors).toBe(2)
    })

    it('does not return unevaluated candidates when the semantic budget is exhausted', async () => {
        const f = fixture()
        f.request.faqSession.budget = new FAQRetrievalBudget({ ...FAQ_RETRIEVAL_LIMITS, semanticComparisons: 0 })
        expect(await f.service.createSession(f.request).filter([faq()])).toEqual([])
        expect(f.embed).not.toHaveBeenCalled()
    })

    it('fails explicitly when querying the model fails', async () => {
        const f = fixture()
        f.query.mockRejectedValue(new Error('provider down'))
        const session = f.service.createSession(f.request)
        await expect(session.filter([faq()])).rejects.toMatchObject({ reason: 'model_failed' })
        expect(session.diagnostics.failureReason).toBe('model_failed')
        expect(session.diagnostics.decisions).toEqual([])
    })
})
